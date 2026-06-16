import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env.js";
import type { SignedUpload, SignedUrl, Storage } from "../storage/index.js";

/**
 * Uses the service-role key (server-side only — never ship this to a client).
 * The audio bucket must be created as PRIVATE; access is exclusively via the
 * signed URLs minted here.
 */
export class SupabaseStorage implements Storage {
  private client: SupabaseClient;
  private bucket = env.AUDIO_BUCKET;

  constructor() {
    this.client = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async getSignedStreamUrl(key: string, ttlSec = env.SIGNED_URL_TTL_SEC): Promise<SignedUrl> {
    const { data, error } = await this.client.storage.from(this.bucket).createSignedUrl(key, ttlSec);
    if (error || !data) throw new Error(`createSignedUrl failed: ${error?.message}`);
    return { url: data.signedUrl, expiresAt: new Date(Date.now() + ttlSec * 1000).toISOString() };
  }

  async getSignedUploadUrl(key: string, _ttlSec?: number): Promise<SignedUpload> {
    // Supabase signed upload URLs are single-use with a fixed (~2h) expiry.
    const { data, error } = await this.client.storage.from(this.bucket).createSignedUploadUrl(key);
    if (error || !data) throw new Error(`createSignedUploadUrl failed: ${error?.message}`);
    return {
      url: data.signedUrl,
      method: "PUT",
      key,
      // Clients upload with the standard PUT to data.signedUrl; the token is embedded in the URL.
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    };
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).upload(key, body, { contentType, upsert: true });
    if (error) throw new Error(`upload failed: ${error.message}`);
  }

  async getObject(key: string): Promise<Buffer> {
    const { data, error } = await this.client.storage.from(this.bucket).download(key);
    if (error || !data) throw new Error(`download failed: ${error?.message}`);
    return Buffer.from(await data.arrayBuffer());
  }

  async deleteObject(key: string): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).remove([key]);
    if (error) throw new Error(`remove failed: ${error.message}`);
  }
}
