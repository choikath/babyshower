import { randomBytes } from "node:crypto";

/**
 * Capability tokens for cards (spec 1.1).
 *
 * 22 base62 characters => 62^22 ≈ 2^130.9 bits of entropy. We draw bytes from a
 * CSPRNG and reject values that would bias the modulo, so every character is a
 * uniform draw over the 62-symbol alphabet. The token identifies a *card*
 * (Option C, spec Decision 2) — never a story directly, and never an account.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const TOKEN_LENGTH = 22;
// Largest multiple of 62 that fits in a byte is 248; reject [248,256) to stay unbiased.
const REJECT_AT = 248;

export function generateToken(length = TOKEN_LENGTH): string {
  let out = "";
  while (out.length < length) {
    const buf = randomBytes(length * 2); // over-draw to limit reseed loops
    for (let i = 0; i < buf.length && out.length < length; i++) {
      const b = buf[i]!;
      if (b >= REJECT_AT) continue;
      out += ALPHABET[b % 62]!;
    }
  }
  return out;
}

const TOKEN_RE = /^[0-9A-Za-z]{22}$/;

/** Cheap structural check before hitting the DB (keeps the resolver hot path tight). */
export function isWellFormedToken(token: string): boolean {
  return TOKEN_RE.test(token);
}
