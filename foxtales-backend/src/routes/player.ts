import { Router, type Request, type Response } from "express";
import { ah } from "../http.js";
import { resolveToken } from "../resolve.js";
import { renderMessage, renderPlayer } from "../views/player.js";
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
