import { createHmac } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { ah } from "../http.js";
import { env } from "../env.js";
import { optionalAuth, requireAuth, isAdminEmail, HttpError } from "../auth.js";
import { getRepo } from "../repo.js";
import { ipLimiter } from "../ratelimit.js";
import type { EventInput } from "../types.js";

export const eventsRouter: Router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const asUuidOrNull = (v: unknown): string | null => (typeof v === "string" && UUID_RE.test(v) ? v : null);

/** Pseudonymous, non-reversible client fingerprint. Never store the raw IP. */
function hashIp(ip: string | undefined, ua: string | undefined): string | null {
  if (!ip) return null;
  return createHmac("sha256", env.ANALYTICS_SALT).update(`${ip}|${ua ?? ""}`).digest("hex").slice(0, 32);
}

// One client event. Unknown/extra keys are ignored; props is free-form but bounded
// by the 1mb JSON body limit and the 50-event batch cap below.
const EventZ = z.object({
  event: z.string().min(1).max(64),
  clientTs: z.string().datetime({ offset: true }).optional().catch(undefined),
  sessionId: z.string().max(64).optional(),
  deviceId: z.string().max(64).optional(),
  familyId: z.string().max(64).optional(),
  flow: z.string().max(32).optional(),
  step: z.string().max(48).optional(),
  props: z.record(z.unknown()).optional(),
});
const BodyZ = z.union([EventZ, z.object({ events: z.array(EventZ).min(1).max(50) })]);

/**
 * Public, fire-and-forget analytics ingest. The recorder beacons events here
 * (sendBeacon). No auth required — the recorder is anonymous — but optionalAuth
 * attributes a signed-in user when a token is present. The server stamps ts, the
 * user-agent, and a hashed IP; client-supplied identity is never trusted for user_id.
 */
eventsRouter.post(
  "/events",
  ipLimiter,
  optionalAuth,
  ah(async (req: Request, res: Response) => {
    // Respond fast and never surface ingest errors to the client.
    let body: z.infer<typeof BodyZ>;
    try {
      body = BodyZ.parse(req.body);
    } catch {
      res.status(204).end();
      return;
    }
    const list = "events" in body ? body.events : [body];
    const ua = req.get("user-agent")?.slice(0, 400) ?? null;
    const ipHash = hashIp(req.ip, req.get("user-agent") ?? undefined);
    const userId = req.userId ?? null; // trust the verified token, never the client field

    const rows: EventInput[] = list.map((e) => ({
      event: e.event,
      clientTs: e.clientTs ?? null,
      sessionId: e.sessionId ?? null,
      deviceId: e.deviceId ?? null,
      userId,
      familyId: asUuidOrNull(e.familyId),
      flow: e.flow ?? null,
      step: e.step ?? null,
      props: (e.props ?? {}) as Record<string, unknown>,
      ua,
      ipHash,
      source: "client",
    }));

    const repo = await getRepo();
    repo.insertEvents(rows).catch((err) => console.error("events insert failed:", err));
    res.status(204).end();
  }),
);

/** The record-your-own funnel for the admin dashboard. Admin email only. */
eventsRouter.get(
  "/analytics/funnel",
  requireAuth,
  ah(async (req: Request, res: Response) => {
    if (!isAdminEmail(req.userEmail)) throw new HttpError(403, "forbidden");
    const hours = Math.min(Math.max(Math.floor(Number(req.query.hours) || 168), 1), 24 * 90);
    const repo = await getRepo();
    res.json(await repo.getRecordFunnel(hours));
  }),
);
