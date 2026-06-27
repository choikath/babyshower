import express, { type NextFunction, type Request, type Response, Router } from "express";
import { ZodError } from "zod";
import { env } from "./env.js";
import { HttpError } from "./auth.js";
import { aasaRouter } from "./routes/aasa.js";
import { resolverRouter } from "./routes/resolver.js";
import { playerRouter } from "./routes/player.js";
import { cardsRouter } from "./routes/cards.js";
import { storiesRouter } from "./routes/stories.js";
import { notesRouter } from "./routes/notes.js";
import { eventsRouter } from "./routes/events.js";
import { devSeed } from "./devseed.js";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", env.TRUST_PROXY);

// CORS. The browser front-end (foxtales-app.html) calls /api from its own
// origin — possibly file://, localhost, or a host that isn't this app — so the
// responses need CORS headers or the browser blocks them. We authenticate with
// a Supabase Bearer token (no cookies), so allowing any origin is safe: an
// unauthenticated origin still can't do anything without a valid user token.
// Pin it to a single origin by setting CORS_ALLOW_ORIGIN if you ever want to.
const corsOrigin = process.env.CORS_ALLOW_ORIGIN || "*";
app.use((req: Request, res: Response, next: NextFunction) => {
  res.header("Access-Control-Allow-Origin", corsOrigin);
  res.header("Vary", "Origin");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "authorization, content-type, x-upsert");
  res.header("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

// Health.
app.get("/healthz", (_req, res) => {
  res.json({ ok: true, dbDriver: env.DB_DRIVER, storageDriver: env.STORAGE_DRIVER });
});

// Public surface.
app.use(aasaRouter); // /.well-known/apple-app-site-association
app.use(resolverRouter); // /p/:token
app.use(playerRouter); // /play/:token

// API. Auth is declared per-route, not blanket here: contributor writes
// (POST /stories, /stories/:id/stitch, /cards, /cards/:id/link) use optionalAuth +
// authorizeContribution so an anonymous share-link recorder can post to a family on
// the PUBLIC_CONTRIB_FAMILY_IDS allowlist, while reads/owner ops keep requireAuth.
// A blanket api.use(requireAuth) here would 401 those anonymous writes before their
// route ran — which is exactly what broke "Finish & upload" for signed-out visitors.
const api = Router();
api.use(express.json({ limit: "1mb" }));
api.use(cardsRouter);
api.use(storiesRouter);
api.use(notesRouter);
api.use(eventsRouter);
app.use("/api", api);

// Dev-only signed local media (mirrors signed-URL storage without Supabase).
if (env.STORAGE_DRIVER === "local") {
  const { verifyLocalSignature, localSafePath } = await import("./storage/local.js");
  const contentTypeFor = (key: string) =>
    key.endsWith(".mp3") ? "audio/mpeg" : key.endsWith(".json") ? "application/json" : "application/octet-stream";

  app.get("/_local-media/*", (req: Request, res: Response) => {
    const key = (req.params as any)[0] as string;
    const exp = Number(req.query.exp), sig = String(req.query.sig || "");
    if (!verifyLocalSignature("GET", key, exp, sig)) {
      res.status(403).json({ error: "bad_signature" });
      return;
    }
    res.type(contentTypeFor(key));
    res.sendFile(localSafePath(key), { acceptRanges: true }, (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  });

  app.put("/_local-media/*", express.raw({ type: "*/*", limit: "64mb" }), async (req: Request, res: Response) => {
    const key = (req.params as any)[0] as string;
    const exp = Number(req.query.exp), sig = String(req.query.sig || "");
    if (!verifyLocalSignature("PUT", key, exp, sig)) {
      res.status(403).json({ error: "bad_signature" });
      return;
    }
    const { LocalStorage } = await import("./storage/local.js");
    await new LocalStorage().putObject(key, req.body as Buffer, contentTypeFor(key));
    res.status(200).json({ ok: true, key });
  });
}

// 404.
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "not_found" });
});

// Error handler.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: "invalid_request", details: err.issues });
    return;
  }
  console.error("unhandled error:", err);
  res.status(500).json({ error: "internal_error" });
});

await devSeed();

app.listen(env.PORT, () => {
  console.log(`FoxTales backend on :${env.PORT}  (db=${env.DB_DRIVER}, storage=${env.STORAGE_DRIVER})`);
  console.log(`  public base: ${env.PUBLIC_BASE_URL}`);
});
