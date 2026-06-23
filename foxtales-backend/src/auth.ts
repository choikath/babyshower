import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { env } from "./env.js";
import { getRepo } from "./repo.js";
import type { Role } from "./types.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
    }
  }
}

// Supabase signs current user session JWTs with asymmetric keys (ES256), while
// older/legacy projects use the symmetric HS256 shared secret. We verify against
// the project's published JWKS first (the asymmetric path, fetched + cached by
// jose), and fall back to the shared secret if one is configured — so this works
// on either setup without code changes.
const jwks = env.SUPABASE_URL
  ? createRemoteJWKSet(new URL("/auth/v1/.well-known/jwks.json", env.SUPABASE_URL))
  : null;
const hsKey = env.SUPABASE_JWT_SECRET ? new TextEncoder().encode(env.SUPABASE_JWT_SECRET) : null;

// Families opted into anonymous share-link contribution (env.PUBLIC_CONTRIB_FAMILY_IDS).
// Parsed once at boot; UUIDs are compared case-insensitively.
const publicContribFamilies = new Set(
  env.PUBLIC_CONTRIB_FAMILY_IDS.split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

// Inbox admins (env.ADMIN_EMAILS) — emails allowed to read any family's inbox.
const adminEmails = new Set(
  env.ADMIN_EMAILS.split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);

/** True when `familyId` is on the public-contributor allowlist (writes need no auth). */
export function isPublicContribFamily(familyId: string): boolean {
  return publicContribFamilies.has(familyId.trim().toLowerCase());
}

/** True when `email` is on the inbox-admin allowlist (reads any family). */
export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && adminEmails.has(email.trim().toLowerCase());
}

/** Identity carried by a verified Supabase access token. */
export interface VerifiedToken {
  userId: string;
  email: string | null;
}

const claimEmail = (payload: JWTPayload): string | null => {
  const e = (payload as { email?: unknown }).email;
  return typeof e === "string" && e ? e : null;
};

/** Verify a Supabase access token and return its `sub` (the auth user id) + email. */
export async function verifySupabaseJwt(token: string): Promise<VerifiedToken> {
  // Asymmetric (current Supabase default).
  if (jwks) {
    try {
      const { payload } = await jwtVerify(token, jwks);
      if (payload.sub) return { userId: String(payload.sub), email: claimEmail(payload) };
    } catch (err) {
      // A token signed with the legacy secret won't match the JWKS — try that next.
      if (!hsKey) throw err;
    }
  }
  // Legacy symmetric secret.
  if (hsKey) {
    const { payload } = await jwtVerify(token, hsKey);
    if (payload.sub) return { userId: String(payload.sub), email: claimEmail(payload) };
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
    const v = await verifySupabaseJwt(match[1]!);
    req.userId = v.userId;
    req.userEmail = v.email ?? undefined;
    next();
  } catch {
    res.status(401).json({ error: "invalid_token" });
  }
}

/**
 * Like requireAuth, but never 401s. If a valid Bearer token is present it pins
 * req.userId (so a signed-in member is still attributed); otherwise it leaves
 * req.userId undefined and continues. Used on the public contributor routes so an
 * anonymous share-link recorder can post. The route handler must still gate with
 * authorizeContribution() — optionalAuth only resolves identity, it grants nothing.
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (env.DEV_BYPASS_AUTH) {
    req.userId = env.DEV_USER_ID;
    next();
    return;
  }
  const header = req.header("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (match && (jwks || hsKey)) {
    try {
      const v = await verifySupabaseJwt(match[1]!);
      req.userId = v.userId;
      req.userEmail = v.email ?? undefined;
    } catch {
      // A bad/expired token on an optional route is treated as anonymous, not rejected.
    }
  }
  next();
}

/**
 * Authorization for the public-capable contributor routes. If the target family
 * is on the public-contributor allowlist, anonymous writes are allowed and no
 * role check runs. Otherwise this behaves exactly like the old gate: a verified
 * token is required (401 if absent) and the user must hold one of `roles`.
 */
export async function authorizeContribution(req: Request, familyId: string, roles: Role[]): Promise<void> {
  if (isPublicContribFamily(familyId)) return;
  if (!req.userId) throw new HttpError(401, "missing_bearer_token");
  await assertFamilyRole(req.userId, familyId, roles);
}

/**
 * Read authorization for a family's inbox. An allowlisted admin email (ADMIN_EMAILS)
 * may read any family without a membership row — that's how the prototype dashboard
 * owner sees every stranger's contribution to the shared family. Everyone else must
 * be a member of that family.
 */
export async function authorizeFamilyRead(req: Request, familyId: string): Promise<void> {
  if (isAdminEmail(req.userEmail)) return;
  if (!req.userId) throw new HttpError(401, "missing_bearer_token");
  await assertFamilyRole(req.userId, familyId, ["owner", "member"]);
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
