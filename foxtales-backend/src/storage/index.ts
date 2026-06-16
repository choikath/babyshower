import { env } from "../env.js";

export interface SignedUrl {
  url: string;
  expiresAt: string; // ISO
}

export interface SignedUpload {
  url: string;
  method: "PUT";
  key: string;
  headers?: Record<string, string>;
  expiresAt: string;
}

/**
 * Abstraction over object storage. Production uses Supabase Storage (private
 * bucket + signed URLs); dev uses local disk with HMAC-signed URLs served by
 * this app. Both keep media non-public and only reachable via short-lived URLs
 * (spec 1.1, 2.6).
 */
export interface Storage {
  /** Short-lived URL to stream/download an object (the resolver hands this to clients). */
  getSignedStreamUrl(key: string, ttlSec?: number): Promise<SignedUrl>;
  /** Short-lived URL the client PUTs a raw recording part to (spec 2.5). */
  getSignedUploadUrl(key: string, ttlSec?: number): Promise<SignedUpload>;
  /** Server-side write (used by the stitch worker to store the final MP3 + peaks). */
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Server-side read (used by the stitch worker to fetch raw parts). */
  getObject(key: string): Promise<Buffer>;
  /** Hard-delete (spec 2.6 — delete on request). */
  deleteObject(key: string): Promise<void>;
}

let storageSingleton: Storage | null = null;

export async function getStorage(): Promise<Storage> {
  if (storageSingleton) return storageSingleton;
  let impl: Storage;
  if (env.STORAGE_DRIVER === "supabase") {
    const { SupabaseStorage } = await import("./supabase.js");
    impl = new SupabaseStorage();
  } else {
    const { LocalStorage } = await import("./local.js");
    impl = new LocalStorage();
  }
  storageSingleton = impl;
  return impl;
}
