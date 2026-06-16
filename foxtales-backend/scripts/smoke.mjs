import { readFile } from "node:fs/promises";

const BASE = process.env.BASE || "http://localhost:8080";
const FAMILY = "00000000-0000-0000-0000-0000000000f1"; // SEED_FAMILY_ID
const A = "test-assets";

let pass = 0, fail = 0;
function check(name, ok, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
  ok ? pass++ : fail++;
}
const j = async (r) => { try { return await r.json(); } catch { return null; } };

async function main() {
  // 1. Create a story + get signed upload URLs.
  let r = await fetch(`${BASE}/api/stories`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      familyId: FAMILY, fromName: "Grandpa Joe", title: "The Sleepy Little Fox",
      author: "Grandpa Joe", note: "Goodnight, Wren — see you in the morning.",
      parts: 2, wantsChime: true,
    }),
  });
  let created = await j(r);
  check("POST /api/stories", r.status === 201 && created?.story?.id && created?.uploads?.parts?.length === 2, `status ${r.status}`);
  const storyId = created.story.id;

  // 2. Upload raw parts + chime to the signed PUT URLs.
  const files = [
    [created.uploads.parts[0].url, `${A}/part-0.m4a`],
    [created.uploads.parts[1].url, `${A}/part-1.m4a`],
    [created.uploads.chime.url, `${A}/chime.m4a`],
  ];
  let uploadsOk = true;
  for (const [url, path] of files) {
    const buf = await readFile(path);
    const up = await fetch(url, { method: "PUT", headers: { "content-type": "audio/mp4" }, body: buf });
    if (!up.ok) uploadsOk = false;
  }
  check("PUT signed upload URLs (2 parts + chime)", uploadsOk);

  // 3. Stitch (runs the real ffmpeg pipeline).
  r = await fetch(`${BASE}/api/stories/${storyId}/stitch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      parts: [created.uploads.parts[0].key, created.uploads.parts[1].key],
      chime: created.uploads.chime.key,
    }),
  });
  let stitched = await j(r);
  check("POST /stitch -> ready", r.status === 200 && stitched?.story?.status === "ready" && stitched?.story?.durationSec > 0, `dur ${stitched?.story?.durationSec}s`);

  // 4. Mint a card and link it to the story.
  r = await fetch(`${BASE}/api/cards`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ familyId: FAMILY }),
  });
  let card = await j(r);
  check("POST /api/cards (mint token)", r.status === 201 && /^[0-9A-Za-z]{22}$/.test(card?.token || ""), `token ${card?.token}`);
  const token = card.token;

  r = await fetch(`${BASE}/api/cards/${card.cardId}/link`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ storyId }),
  });
  check("POST /api/cards/:id/link", r.status === 200);

  // 5. Resolve as JSON (App Clip path).
  r = await fetch(`${BASE}/p/${token}`, { headers: { Accept: "application/json" } });
  let resolved = await j(r);
  check("GET /p/:token (json) -> 200 + signed stream", r.status === 200 && !!resolved?.stream?.url && !!resolved?.story?.peaksUrl, `expiresAt ${resolved?.stream?.expiresAt}`);

  // 6. Fetch the signed stream (full + range).
  let media = await fetch(resolved.stream.url);
  const ct = media.headers.get("content-type") || "";
  const bytes = (await media.arrayBuffer()).byteLength;
  check("GET signed stream -> audio/mpeg", media.status === 200 && ct.includes("audio/mpeg") && bytes > 1000, `${ct}, ${bytes}B`);

  let ranged = await fetch(resolved.stream.url, { headers: { Range: "bytes=0-99" } });
  check("GET signed stream with Range -> 206", ranged.status === 206, `status ${ranged.status}`);

  // 7. Peaks JSON.
  let peaksRes = await fetch(resolved.story.peaksUrl);
  let peaks = await j(peaksRes);
  check("GET peaksUrl -> 400-bucket waveform", peaksRes.status === 200 && peaks?.count === 400 && Array.isArray(peaks?.peaks), `count ${peaks?.count}`);

  // 8. Content negotiation: browser gets a 302 to the player.
  r = await fetch(`${BASE}/p/${token}`, { headers: { Accept: "text/html" }, redirect: "manual" });
  const loc = r.headers.get("location") || "";
  check("GET /p/:token (html) -> 302 to /play", r.status === 302 && loc.includes(`/play/${token}`), `-> ${loc}`);

  // 9. Web player page renders with the title.
  r = await fetch(`${BASE}/play/${token}`);
  const html = await r.text();
  check("GET /play/:token -> branded player", r.status === 200 && html.includes("The Sleepy Little Fox") && html.includes("Grandpa Joe"));

  // 10. AASA.
  r = await fetch(`${BASE}/.well-known/apple-app-site-association`);
  let aasa = await j(r);
  const ctAasa = r.headers.get("content-type") || "";
  check("GET AASA -> applinks + appclips", r.status === 200 && ctAasa.includes("application/json") && !!aasa?.applinks?.details?.[0]?.appID && !!aasa?.appclips?.apps?.[0], `appID ${aasa?.applinks?.details?.[0]?.appID}`);

  // 11. Unknown token -> 404.
  r = await fetch(`${BASE}/p/AAAAAAAAAAAAAAAAAAAAAA`, { headers: { Accept: "application/json" } });
  check("GET /p/<unknown> (json) -> 404", r.status === 404, `status ${r.status}`);

  // 12. Revoke -> token stops resolving (410).
  await fetch(`${BASE}/api/cards/${card.cardId}/revoke`, { method: "POST" });
  r = await fetch(`${BASE}/p/${token}`, { headers: { Accept: "application/json" } });
  check("revoked card -> 410 Gone", r.status === 410, `status ${r.status}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error("smoke error:", e); process.exit(1); });
