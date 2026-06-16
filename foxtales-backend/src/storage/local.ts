import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { env } from "../env.js";
import type { SignedUpload, SignedUrl, Storage } from "../storage/index.js";

/**
 * Dev-only object storage on local disk. URLs are HMAC-signed and time-bounded,
 * mirroring the production "media is reachable only via short-lived signed URL"
 * property so the full tap-to-play flow is exercisable without Supabase.
 */
const ROOT = resolve(env.LOCAL_MEDIA_DIR);

function sign(method: string, key: string, exp: number): string {
  return createHmac("sha256", env.LOCAL_SIGNING_SECRET).update(`${method}\n${key}\n${exp}`).digest("hex");
}

/** Validates a presented signature for the local-media route. */
export function verifyLocalSignature(method: string, key: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const expected = sign(method, key, exp);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(sig, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function safePath(key: string): string {
  const p = resolve(join(ROOT, key));
  if (!p.startsWith(ROOT)) throw new Error("path traversal blocked");
  return p;
}

function makeUrl(method: "GET" | "PUT", key: string, ttlSec: number): { url: string; exp: number } {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const sig = sign(method, key, exp);
  const url = `${env.PUBLIC_BASE_URL}/_local-media/${key}?exp=${exp}&sig=${sig}`;
  return { url, exp };
}

export class LocalStorage implements Storage {
  async getSignedStreamUrl(key: string, ttlSec = env.SIGNED_URL_TTL_SEC): Promise<SignedUrl> {
    const { url, exp } = makeUrl("GET", key, ttlSec);
    return { url, expiresAt: new Date(exp * 1000).toISOString() };
  }
  async getSignedUploadUrl(key: string, ttlSec = env.SIGNED_URL_TTL_SEC): Promise<SignedUpload> {
    const { url, exp } = makeUrl("PUT", key, ttlSec);
    return { url, method: "PUT", key, expiresAt: new Date(exp * 1000).toISOString() };
  }
  async putObject(key: string, body: Buffer, _contentType: string): Promise<void> {
    const p = safePath(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, body);
  }
  async getObject(key: string): Promise<Buffer> {
    return readFile(safePath(key));
  }
  async deleteObject(key: string): Promise<void> {
    await rm(safePath(key), { force: true });
  }
}

export { ROOT as LOCAL_MEDIA_ROOT, safePath as localSafePath };
