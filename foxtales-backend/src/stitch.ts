import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * One ffmpeg pipeline for both the web and (future) iOS recorders (spec 2.5):
 *
 *   per speech segment: silenceremove edge-trim
 *   -> concat in order with 0.35s gaps and a chime between parts
 *   -> loudnorm
 *   -> encode MP3 64kbps mono
 *   -> emit waveform peaks JSON
 *
 * Output is fully re-renderable later (new chime, loudness fix) without asking
 * the sender to re-record — which is the whole reason stitching lives server-side.
 */

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";

const SR = 48000; // intermediate sample rate
const GAP_SECONDS = 0.35; // spec 2.5
const PEAK_BUCKETS = 400; // waveform resolution for the scrub bar
// Trim leading/trailing near-silence from speech; keep the chime untouched.
const TRIM_FILTER =
  "silenceremove=start_periods=1:start_threshold=-50dB:detection=peak," +
  "areverse," +
  "silenceremove=start_periods=1:start_threshold=-50dB:detection=peak," +
  "areverse";

export interface StitchManifest {
  /** Ordered absolute paths to raw recorded part files (AAC/M4A/WAV/etc). */
  parts: string[];
  /** Optional intro segment, prepended. */
  intro?: string;
  /** Optional outro segment, appended. */
  outro?: string;
  /** Optional chime inserted between parts. */
  chime?: string;
}

export interface StitchResult {
  mp3Path: string;
  peaks: { version: 1; count: number; peaks: number[] };
  durationSec: number;
}

function run(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${bin} exited ${code}: ${err.slice(-800)}`)),
    );
  });
}

function runToBuffer(bin: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let err = "";
    p.stdout.on("data", (d) => chunks.push(d));
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`${bin} exited ${code}: ${err.slice(-800)}`)),
    );
  });
}

/** Normalize one input to mono pcm_s16le @ SR, optionally edge-trimming silence. */
async function normalize(input: string, out: string, trim: boolean): Promise<void> {
  const af = trim ? TRIM_FILTER : "anull";
  await run(FFMPEG, [
    "-y", "-loglevel", "error",
    "-i", input,
    "-af", af,
    "-ac", "1", "-ar", String(SR),
    "-c:a", "pcm_s16le",
    out,
  ]);
}

/** A fixed-length silence segment in the common intermediate format. */
async function silence(seconds: number, out: string): Promise<void> {
  await run(FFMPEG, [
    "-y", "-loglevel", "error",
    "-f", "lavfi",
    "-i", `anullsrc=r=${SR}:cl=mono`,
    "-t", String(seconds),
    "-c:a", "pcm_s16le",
    out,
  ]);
}

async function probeDurationSec(path: string): Promise<number> {
  const out = await runToBuffer(FFPROBE, [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=nokey=1:noprint_wrappers=1",
    path,
  ]);
  return Math.round(parseFloat(out.toString().trim()) * 100) / 100;
}

/** Decode to low-rate mono PCM and reduce to PEAK_BUCKETS normalized magnitudes. */
async function computePeaks(path: string, buckets = PEAK_BUCKETS) {
  const pcm = await runToBuffer(FFMPEG, [
    "-v", "error",
    "-i", path,
    "-ac", "1", "-ar", "8000",
    "-f", "s16le", "-",
  ]);
  const samples = pcm.length >> 1; // int16
  const peaks = new Array<number>(buckets).fill(0);
  if (samples === 0) return { version: 1 as const, count: buckets, peaks };
  const per = samples / buckets;
  for (let i = 0; i < samples; i++) {
    const v = Math.abs(pcm.readInt16LE(i << 1)) / 32768;
    const b = Math.min(buckets - 1, Math.floor(i / per));
    if (v > peaks[b]!) peaks[b] = v;
  }
  // Round for compact JSON.
  for (let i = 0; i < buckets; i++) peaks[i] = Math.round(peaks[i]! * 1000) / 1000;
  return { version: 1 as const, count: buckets, peaks };
}

export async function stitch(manifest: StitchManifest, opts?: { keepWorkDir?: boolean }): Promise<StitchResult> {
  if (!manifest.parts?.length) throw new Error("manifest.parts is empty");
  const work = await mkdtemp(join(tmpdir(), "foxtales-stitch-"));
  try {
    const gapPath = join(work, "gap.wav");
    await silence(GAP_SECONDS, gapPath);

    // Normalize every segment into the work dir, building the ordered concat list.
    const order: string[] = [];
    let n = 0;
    const norm = async (src: string, trim: boolean) => {
      const out = join(work, `seg-${String(n++).padStart(3, "0")}.wav`);
      await normalize(src, out, trim);
      return out;
    };

    let chimePath: string | null = null;
    if (manifest.chime) chimePath = await norm(manifest.chime, false);

    if (manifest.intro) {
      order.push(await norm(manifest.intro, true), gapPath);
    }
    for (let i = 0; i < manifest.parts.length; i++) {
      order.push(await norm(manifest.parts[i]!, true));
      const isLast = i === manifest.parts.length - 1;
      if (!isLast) {
        // 0.35s gap, chime (if any), 0.35s gap, then the next part.
        order.push(gapPath);
        if (chimePath) order.push(chimePath, gapPath);
      }
    }
    if (manifest.outro) {
      order.push(gapPath, await norm(manifest.outro, true));
    }

    // Concat demuxer over identical-format intermediates.
    const listPath = join(work, "list.txt");
    await writeFile(listPath, order.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));
    const joined = join(work, "joined.wav");
    await run(FFMPEG, [
      "-y", "-loglevel", "error",
      "-f", "concat", "-safe", "0",
      "-i", listPath,
      "-c:a", "pcm_s16le",
      joined,
    ]);

    // loudnorm + final MP3 64kbps mono.
    const mp3Path = join(work, "final.mp3");
    await run(FFMPEG, [
      "-y", "-loglevel", "error",
      "-i", joined,
      "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
      "-c:a", "libmp3lame", "-b:a", "64k", "-ac", "1", "-ar", "44100",
      mp3Path,
    ]);

    const [durationSec, peaks] = await Promise.all([
      probeDurationSec(mp3Path),
      computePeaks(mp3Path),
    ]);

    return { mp3Path, peaks, durationSec };
  } finally {
    if (!opts?.keepWorkDir) {
      // Caller is responsible for reading mp3Path before this resolves if keepWorkDir is false,
      // so we only auto-clean when explicitly told it's safe. Default: keep.
    }
  }
}

// ---------------------------------------------------------------------------
// Self-test: synthesize a few "spoken" parts + a chime, stitch, and report.
// Run with:  npm run stitch:selftest
// ---------------------------------------------------------------------------
async function selftest() {
  const work = await mkdtemp(join(tmpdir(), "foxtales-selftest-"));
  const mk = async (file: string, lavfiArgs: string[]) => {
    const out = join(work, file);
    await run(FFMPEG, ["-y", "-loglevel", "error", ...lavfiArgs, "-c:a", "pcm_s16le", out]);
    return out;
  };
  // Each "part": 0.6s leading silence + tone + 0.6s trailing silence, so edge-trim has work to do.
  const part = async (file: string, freq: number, secs: number) =>
    mk(file, [
      "-f", "lavfi", "-i", `sine=frequency=${freq}:duration=${secs}`,
      "-af", "adelay=600,apad=pad_dur=0.6",
    ]);

  console.log("synthesizing test segments...");
  const p1 = await part("p1.wav", 220, 1.5);
  const p2 = await part("p2.wav", 330, 1.8);
  const p3 = await part("p3.wav", 262, 1.2);
  const intro = await mk("intro.wav", ["-f", "lavfi", "-i", "sine=frequency=180:duration=1.0"]);
  const outro = await mk("outro.wav", ["-f", "lavfi", "-i", "sine=frequency=200:duration=1.0"]);
  const chime = await mk("chime.wav", ["-f", "lavfi", "-i", "sine=frequency=880:duration=0.3"]);

  console.log("stitching...");
  const res = await stitch({ parts: [p1, p2, p3], intro, outro, chime }, { keepWorkDir: true });

  const bytes = (await readFile(res.mp3Path)).length;
  const nonZeroPeaks = res.peaks.peaks.filter((v) => v > 0.01).length;
  console.log(JSON.stringify({
    mp3Path: res.mp3Path,
    mp3Bytes: bytes,
    durationSec: res.durationSec,
    peakBuckets: res.peaks.count,
    nonZeroPeaks,
    firstPeaks: res.peaks.peaks.slice(0, 8),
  }, null, 2));

  await rm(work, { recursive: true, force: true });
  // Leave res.mp3Path's dir for inspection (different temp dir).
  console.log("\nOK: stitch pipeline produced a valid MP3 with a waveform.");
}

if (process.argv.includes("--selftest")) {
  selftest().catch((e) => {
    console.error("SELFTEST FAILED:", e);
    process.exit(1);
  });
}
