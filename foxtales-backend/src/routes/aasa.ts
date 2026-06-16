import { Router, type Request, type Response } from "express";
import { env } from "../env.js";

export const aasaRouter: Router = Router();

/**
 * Apple App Site Association. Must be served at this exact path, over HTTPS at
 * the domain apex, as application/json, with NO redirect (Apple fetches it
 * directly and does not follow redirects). Lists the full app for Universal
 * Links on /p/* and the App Clip for tap-to-launch (spec 1.2, 1.3).
 */
aasaRouter.get("/.well-known/apple-app-site-association", (_req: Request, res: Response) => {
  const fullAppId = `${env.APPLE_TEAM_ID}.${env.IOS_BUNDLE_ID}`;
  const clipAppId = `${env.APPLE_TEAM_ID}.${env.APPCLIP_BUNDLE_ID}`;
  res.type("application/json").json({
    applinks: {
      apps: [],
      details: [{ appID: fullAppId, paths: ["/p/*"] }],
    },
    appclips: {
      apps: [clipAppId],
    },
  });
});
