import rateLimit from "express-rate-limit";

/** Coarse per-IP ceiling across all public endpoints. */
export const ipLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

/**
 * Per-token limiter for /p/:token — a single card being hit dozens of times a
 * minute is abuse, not bedtime. Keyed by the token, falling back to IP.
 */
export const tokenLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => req.params.token ?? req.ip ?? "unknown",
});
