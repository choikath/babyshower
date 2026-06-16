import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "./env.js";
import { getRepo } from "./repo.js";
import type { Role } from "./types.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

// Supabase signs current user session JWTs with asymmetric keys (ES256), while
// older/legacy projects use the symmetric HS256 shared secret. We verify against
// the project's published JWKS first (the asymmetric path, fetched + cached by
// jose), and fall back to the shared secret if one is configured — so this works
// on either setup without code changes.
const jwks = env.SUPABASE_URL
  ? createRemoteJWKSet(new URL("/auth/v1/jwks", env.SUPABASE_URL))
  : null;
const hsKey = env.SUPABASE_JWT_SECRET ? new TextEncoder().encode(env.SUPABASE_JWT_SECRET) : null;

/** Verify a Supabase access token and return its `sub` (the auth user id). */
export async function verifySupabaseJwt(token: string): Promise<string> {
  // Asymmetric (current Supabase default).
  if (jwks) {
    try {
      const { payload } = await jwtVerify(token, jwks);
      if (payload.sub) return String(payload.sub);
    } catch (err) {
      // A token signed with the legacy secret won't match the JWKS — try that next.
      if (!hsKey) throw err;
    }
  }
  // Legacy symmetric secret.
  if (hsKey) {
    const { payload } = await jwtVerify(token, hsKey);
    if (payload.sub) return String(payload.sub);
  }
  throw new Error("no_jwt_verification_method_configured");
}

/**
 * Pins req.userId to the verified token's `sub`. In dev, DEV_BYPASS_AUTH
 * short-circuits this so protected endpoints are testable without real tokens.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (env.DEV_BYPASS_AUTH) {
    req.userId = env.DEV_USER_ID;
    next();
    return;
  }
  const header = req.header("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({ error: "missing_bearer_token" });
    return;
  }
  if (!jwks && !hsKey) {
    res.status(500).json({ error: "auth_not_configured" });
    return;
  }
  try {
    req.userId = await verifySupabaseJwt(match[1]!);
    next();
  } catch {
    res.status(401).json({ error: "invalid_token" });
  }
}

/** Asserts the authed user belongs to the family with one of the allowed roles. */
export async function assertFamilyRole(userId: string, familyId: string, allowed: Role[]): Promise<void> {
  const repo = await getRepo();
  const m = await repo.getMembership(familyId, userId);
  if (!m) throw new HttpError(403, "not_a_family_member");
  if (!allowed.includes(m.role)) throw new HttpError(403, "insufficient_role");
}

export class HttpError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}
