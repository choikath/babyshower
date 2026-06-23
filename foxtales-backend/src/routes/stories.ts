import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { ah } from "../http.js";
import { authorizeContribution, authorizeFamilyRead, optionalAuth, requireAuth, HttpError } from "../auth.js";
import { ipLimiter } from "../ratelimit.js";
import { getRepo } from "../repo.js";
import { getStorage } from "../storage/index.js";
import { stitch, type StitchManifest } from "../stitch.js";

export const storiesRouter: Router = Router();

// Deterministic key layout under the private bucket.
const rawPart = (f: string, s: string, i: number) => `families/${f}/stories/${s}/raw/part-${i}.m4a`;
const rawIntro = (f: string, s: string) => `families/${f}/stories/${s}/raw/intro.m4a`;
const rawOutro = (f: string, s: string) => `families/${f}/stories/${s}/raw/outro.m4a`;
const rawChime = (f: string, s: string) => `families/${f}/stories/${s}/raw/chime.m4a`;
const audioKey = (f: string, s: string) => `families/${f}/stories/${s}/audio.mp3`;
const peaksKey = (f: string, s: string) => `families/${f}/stories/${s}/peaks.json`;

/** Create a story (status=processing) and hand back signed PUT URLs for the raw parts. */
storiesRouter.post(
  "/stories",
  ipLimiter,
  optionalAuth,
  ah(async (req: Request, res: Response) => {
    const body = z
      .object({
        familyId: z.string().uuid(),
        fromName: z.string().min(1).max(80),
        title: z.string().min(1).max(120),
        author: z.string().max(80).optional(),
        note: z.string().max(500).optional(),
        parts: z.number().int().min(1).max(20),
        wantsIntro: z.boolean().optional(),
        wantsOutro: z.boolean().optional(),
        wantsChime: z.boolean().optional(),
      })
      .parse(req.body);

    await authorizeContribution(req, body.familyId, ["owner", "member"]);
    const repo = await getRepo();
    const storage = await getStorage();

    const story = await repo.createStory({
      familyId: body.familyId,
      fromName: body.fromName,
      fromUserId: req.userId ?? null,
      title: body.title,
      author: body.author ?? null,
      note: body.note ?? null,
      parts: body.parts,
    });

    const f = body.familyId, s = story.id;
    const partUploads = await Promise.all(
      Array.from({ length: body.parts }, async (_v, i) => {
        const key = rawPart(f, s, i);
        const up = await storage.getSignedUploadUrl(key);
        return { index: i, key, url: up.url, method: up.method };
      }),
    );
    const optional = async (want: boolean | undefined, key: string) =>
      want ? await storage.getSignedUploadUrl(key) : undefined;

    res.status(201).json({
      story: { id: story.id, status: story.status },
      audioKey: audioKey(f, s),
      peaksKey: peaksKey(f, s),
      uploads: {
        parts: partUploads,
        intro: await optional(body.wantsIntro, rawIntro(f, s)),
        outro: await optional(body.wantsOutro, rawOutro(f, s)),
        chime: await optional(body.wantsChime, rawChime(f, s)),
      },
    });
  }),
);

/**
 * Stitch the uploaded raw parts into the final MP3 (spec 2.5). Runs the ffmpeg
 * pipeline inline — fine for short bedtime stories; move to a job queue for long
 * recordings (see README). On success the story flips to `ready`.
 */
storiesRouter.post(
  "/stories/:id/stitch",
  ipLimiter,
  optionalAuth,
  ah(async (req: Request, res: Response) => {
    const body = z
      .object({
        parts: z.array(z.string().min(1)).min(1).max(20),
        intro: z.string().optional(),
        outro: z.string().optional(),
        chime: z.string().optional(),
      })
      .parse(req.body);

    const repo = await getRepo();
    const story = await repo.getStory(req.params.id!);
    if (!story) throw new HttpError(404, "story_not_found");
    await authorizeContribution(req, story.familyId, ["owner", "member"]);

    const storage = await getStorage();
    const work = await mkdtemp(join(tmpdir(), "foxtales-raw-"));
    try {
      // Materialize storage keys to local temp files for ffmpeg.
      const fetchToFile = async (key: string, name: string) => {
        const buf = await storage.getObject(key);
        const p = join(work, name + (extname(key) || ".m4a"));
        await writeFile(p, buf);
        return p;
      };
      const manifest: StitchManifest = {
        parts: await Promise.all(body.parts.map((k, i) => fetchToFile(k, `part-${i}`))),
        intro: body.intro ? await fetchToFile(body.intro, "intro") : undefined,
        outro: body.outro ? await fetchToFile(body.outro, "outro") : undefined,
        chime: body.chime ? await fetchToFile(body.chime, "chime") : undefined,
      };

      const result = await stitch(manifest, { keepWorkDir: true });
      const mp3 = await readFile(result.mp3Path);

      const aKey = audioKey(story.familyId, story.id);
      const pKey = peaksKey(story.familyId, story.id);
      await Promise.all([
        storage.putObject(aKey, mp3, "audio/mpeg"),
        storage.putObject(pKey, Buffer.from(JSON.stringify(result.peaks)), "application/json"),
      ]);

      const updated = await repo.markStoryReady(story.id, {
        audioKey: aKey,
        peaksKey: pKey,
        durationSec: result.durationSec,
        parts: body.parts.length,
      });

      // Clean up the stitch temp dir (holds the produced mp3).
      await rm(dirname(result.mp3Path), { recursive: true, force: true }).catch(() => {});

      // TODO(phase 2): APNs push to the family ("A new story arrived").
      res.json({ story: { id: updated!.id, status: updated!.status, durationSec: updated!.durationSec } });
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => {});
    }
  }),
);

/** The family inbox. Member — or an allowlisted admin email (ADMIN_EMAILS). */
storiesRouter.get(
  "/stories",
  requireAuth,
  ah(async (req: Request, res: Response) => {
    const familyId = z.string().uuid().parse(req.query.familyId);
    await authorizeFamilyRead(req, familyId);
    const repo = await getRepo();
    const stories = await repo.listStoriesForFamily(familyId);
    res.json({
      stories: stories.map((s) => ({
        id: s.id, title: s.title, author: s.author, fromName: s.fromName,
        status: s.status, durationSec: s.durationSec, parts: s.parts,
        playCount: s.playCount, createdAt: s.createdAt,
      })),
    });
  }),
);

/**
 * A short-lived signed URL for the final stitched MP3, for in-app playback in
 * the family surface (the inbox / done screen). Distinct from /p/:token, which
 * resolves a *card* with no auth — this resolves a *story* by id and requires
 * family membership. Owner or member.
 */
storiesRouter.get(
  "/stories/:id/stream",
  requireAuth,
  ah(async (req: Request, res: Response) => {
    const repo = await getRepo();
    const story = await repo.getStory(req.params.id!);
    if (!story) throw new HttpError(404, "story_not_found");
    await authorizeFamilyRead(req, story.familyId);
    if (story.status !== "ready" || !story.audioKey) throw new HttpError(409, "story_not_ready");
    const storage = await getStorage();
    const signed = await storage.getSignedStreamUrl(story.audioKey);
    res.json({ url: signed.url, expiresAt: signed.expiresAt });
  }),
);
