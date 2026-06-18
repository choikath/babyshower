import { Router, type Request, type Response } from "express";
import { env } from "../env.js";
import { ah } from "../http.js";
import { resolveToken } from "../resolve.js";
import { getRepo } from "../repo.js";
import { getStorage } from "../storage/index.js";
import { ipLimiter, tokenLimiter } from "../ratelimit.js";

export const resolverRouter: Router = Router();

/**
 * The capability URL on the tag. Two faces of one endpoint (spec 1.1):
 *   Accept: application/json  -> { story, stream:{ signed url } }   (App Clip / app)
 *   otherwise                 -> 302 to the branded web player        (Safari fallback)
 */
resolverRouter.get("/p/:token", ipLimiter, tokenLimiter, ah(async (req: Request, res: Response) => {
  const token = req.params.token!;
  const wantsJson = req.query.format === "json" || req.accepts(["html", "json"]) === "json";

  if (!wantsJson) {
    // Browsers get redirected to the human-facing player, which re-resolves.
    res.redirect(302, `${env.PUBLIC_BASE_URL}/play/${encodeURIComponent(token)}`);
    return;
  }

  const result = await resolveToken(token, { bump: true });

  switch (result.kind) {
    case "not_found":
      res.status(404).json({ error: "not_found" });
      return;
    case "revoked":
      res.status(410).json({ error: "revoked" });
      return;
    case "unlinked":
      res.status(409).json({ error: "unlinked" });
      return;
    case "processing":
      res.status(202).json({ error: "processing", story: { id: result.story.id, status: "processing" } });
      return;
    case "ready": {
      const storage = await getStorage();
      const repo = await getRepo();
      const story = result.story;
      const stream = await storage.getSignedStreamUrl(story.audioKey!);
      // The waveform is decorative — a missing or unsignable peaks file must never
      // block playback, so sign it best-effort and fall back to no waveform.
      let peaksUrl: string | null = null;
      if (story.peaksKey) {
        try {
          peaksUrl = (await storage.getSignedStreamUrl(story.peaksKey)).url;
        } catch {
          peaksUrl = null;
        }
      }
      // Count the play (best-effort; don't block the response).
      repo.incrementPlayCount(story.id).catch(() => {});
      res.json({
        story: {
          id: story.id,
          title: story.title,
          author: story.author,
          fromName: story.fromName,
          note: story.note,
          durationSec: story.durationSec,
          peaksUrl,
        },
        stream: { url: stream.url, expiresAt: stream.expiresAt },
      });
      return;
    }
  }
}));
