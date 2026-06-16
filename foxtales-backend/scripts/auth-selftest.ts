import { SignJWT } from "jose";
import { verifySupabaseJwt } from "../src/auth.js";

// Exercises the HS256 fallback branch (no SUPABASE_URL set => JWKS path is skipped).
// The asymmetric/JWKS branch needs a live Supabase token to exercise end-to-end,
// which only exists once a user signs in.
const SECRET = process.env.SUPABASE_JWT_SECRET!;
let pass = 0, fail = 0;
const check = (n: string, ok: boolean, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${n}${extra ? "  — " + extra : ""}`); ok ? pass++ : fail++; };

async function mint(sub: string, secret: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret));
}

async function main() {
  // Valid token signed with the configured secret -> returns sub.
  const good = await mint("user-abc-123", SECRET);
  let sub = "";
  try { sub = await verifySupabaseJwt(good); } catch { /* ignore */ }
  check("valid HS256 token verifies and yields sub", sub === "user-abc-123", `sub=${sub}`);

  // Token signed with the WRONG secret -> rejected.
  const bad = await mint("user-abc-123", "a-different-secret");
  let rejected = false;
  try { await verifySupabaseJwt(bad); } catch { rejected = true; }
  check("token signed with wrong secret is rejected", rejected);

  // Garbage -> rejected.
  let rejected2 = false;
  try { await verifySupabaseJwt("not.a.jwt"); } catch { rejected2 = true; }
  check("malformed token is rejected", rejected2);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main();
