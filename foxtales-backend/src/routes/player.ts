import { Router, type Request, type Response } from "express";
import { ah } from "../http.js";
import { resolveToken } from "../resolve.js";
import { renderMessage, renderPlayer } from "../views/player.js";
import { renderNotePage } from "../views/note.js";
import { getRepo } from "../repo.js";
import { ipLimiter } from "../ratelimit.js";

export const playerRouter: Router = Router();

/**
 * The human-facing page (the 302 target for browsers). Renders the player when
 * the story is ready, or a branded message for the other states. Copy speaks in
 * the interface's voice and tells the reader what to do next.
 */
playerRouter.get("/play/:token", ipLimiter, ah(async (req: Request, res: Response) => {
  const token = req.params.token!;
  const result = await resolveToken(token, { bump: false });

  res.type("html");
  switch (result.kind) {
    case "ready":
      res.send(renderPlayer({ token, story: result.story }));
      return;
    case "unlinked":
      res.send(renderMessage({
        eyebrow: "Not linked yet",
        title: "This card isn't linked yet",
        body: "Open FoxTales and choose a story for this card. Once it's linked, tap again to listen.",
      }));
      return;
    case "processing":
      res.send(renderMessage({
        eyebrow: "Almost ready",
        title: "This story is still being prepared",
        body: "We're stitching the recording together. Give it a minute, then tap again.",
      }));
      return;
    case "revoked":
      res.send(renderMessage({
        eyebrow: "Turned off",
        title: "This card was turned off",
        body: "The owner disabled this card. If that's unexpected, check with whoever set it up.",
      }));
      return;
    case "not_found":
      res.send(renderMessage({
        eyebrow: "Not found",
        title: "We couldn't find that card",
        body: "This tag isn't recognized. If you just set it up, give it a moment and tap again.",
      }));
      return;
  }
}));

/**
 * The streamlined voice-memo recorder (spec: recording updates). Reachable from the
 * player's "record a voice note" CTA. Resolves the token only to greet the sender
 * with the reader's name — the memo itself is filed by POST /api/voice-notes.
 */
playerRouter.get("/note/:token", ipLimiter, ah(async (req: Request, res: Response) => {
  const token = req.params.token!;
  const result = await resolveToken(token, { bump: false });

  res.type("html");
  if (result.kind === "not_found") {
    res.send(renderMessage({ eyebrow: "Not found", title: "We couldn't find that card", body: "This tag isn't recognized, so there's no one to send a note to yet." }));
    return;
  }
  if (result.kind === "revoked") {
    res.send(renderMessage({ eyebrow: "Turned off", title: "This card was turned off", body: "The owner disabled this card, so voice notes can't be sent to it." }));
    return;
  }
  const readerName = "story" in result ? result.story.fromName : null;
  res.send(renderNotePage({ token, readerName }));
}));

/**
 * Best-effort click beacon for the player's "record a voice note" CTA. Increments
 * the story's note_cta_clicks. Fired via navigator.sendBeacon, so it returns 204
 * fast and never blocks the navigation to /note/:token.
 */
playerRouter.post("/play/:token/note-click", ipLimiter, ah(async (req: Request, res: Response) => {
  const token = req.params.token!;
  const result = await resolveToken(token, { bump: false });
  if ((result.kind === "ready" || result.kind === "processing") && result.story) {
    const repo = await getRepo();
    repo.incrementNoteCtaClicks(result.story.id).catch(() => {});
  }
  res.status(204).end();
}));

/**
 * Best-effort click beacon for the player's "FoxTales" brand link (the footer link
 * to foxtaleclub.com). Increments the story's foxtales_clicks. Fired via
 * navigator.sendBeacon, so it returns 204 fast and never blocks the outbound tap.
 */
playerRouter.post("/play/:token/foxtales-click", ipLimiter, ah(async (req: Request, res: Response) => {
  const token = req.params.token!;
  const result = await resolveToken(token, { bump: false });
  if ((result.kind === "ready" || result.kind === "processing") && result.story) {
    const repo = await getRepo();
    repo.incrementFoxtalesClicks(result.story.id).catch(() => {});
  }
  res.status(204).end();
}));

/**
 * A real play: the player's audio `play` event fired. The client beacons this once
 * per player-page load (not on every pause/resume), so play_started_count reflects
 * actual listens, distinct from the load-triggered play_count ("opens"). 204 fast.
 */
playerRouter.post("/play/:token/play-started", ipLimiter, ah(async (req: Request, res: Response) => {
  const token = req.params.token!;
  const result = await resolveToken(token, { bump: false });
  if (result.kind === "ready" && result.story) {
    const repo = await getRepo();
    repo.incrementPlayStartedCount(result.story.id).catch(() => {});
  }
  res.status(204).end();
}));

// A single listened report can't add more than this (guards against a bad/abusive
// client inflating the total). Real reports are tiny — the player flushes every ~15s.
const MAX_LISTENED_MS_PER_REPORT = 4 * 60 * 60 * 1000; // 4 hours

/**
 * True listening time: the player reports a delta of *measured* playback (query
 * `ms`) as it plays — periodically, and on pause/ended/pagehide via sendBeacon.
 * The server adds it to listened_ms. Best-effort; validates and clamps the delta.
 */
playerRouter.post("/play/:token/listened", ipLimiter, ah(async (req: Request, res: Response) => {
  const token = req.params.token!;
  const raw = Math.floor(Number(req.query.ms));
  if (Number.isFinite(raw) && raw > 0) {
    const ms = Math.min(raw, MAX_LISTENED_MS_PER_REPORT);
    const result = await resolveToken(token, { bump: false });
    if (result.kind === "ready" && result.story) {
      const repo = await getRepo();
      repo.addListenedMs(result.story.id, ms).catch(() => {});
    }
  }
  res.status(204).end();
}));
