import "dotenv/config";
import { z } from "zod";

/**
 * Two swappable drivers keep this runnable with zero external services for a
 * demo (DB_DRIVER=memory, STORAGE_DRIVER=local) and production-real against
 * Supabase (DB_DRIVER=postgres, STORAGE_DRIVER=supabase).
 */
const Env = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().default(8080),

    // The public HTTPS origin the cards point at (e.g. https://foxtales.app).
    // Tokens are written onto tags as `${PUBLIC_BASE_URL}/p/<token>`.
    PUBLIC_BASE_URL: z.string().url().default("http://localhost:8080"),

    DB_DRIVER: z.enum(["postgres", "memory"]).default("memory"),
    DATABASE_URL: z.string().optional(),

    STORAGE_DRIVER: z.enum(["supabase", "local"]).default("local"),
    AUDIO_BUCKET: z.string().default("audio"),
    SIGNED_URL_TTL_SEC: z.coerce.number().default(600), // 10 min (spec 1.1)

    // Supabase (required only when a Supabase driver is selected)
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    SUPABASE_JWT_SECRET: z.string().optional(),

    // Local dev storage
    LOCAL_MEDIA_DIR: z.string().default("./.media"),
    LOCAL_SIGNING_SECRET: z.string().default("dev-only-insecure-secret-change-me"),

    // Universal Link / App Clip association (spec 1.2)
    APPLE_TEAM_ID: z.string().default("TEAMID"),
    IOS_BUNDLE_ID: z.string().default("app.foxtales.ios"),
    APPCLIP_BUNDLE_ID: z.string().default("app.foxtales.ios.Clip"),
    ITUNES_APP_ID: z.string().optional(), // numeric App Store id, for the Smart App Banner

    // Networking / safety
    TRUST_PROXY: z.coerce.number().default(1), // hops in front (CDN/LB) for correct req.ip

    // Dev-only auth bypass so protected endpoints are testable without Supabase tokens.
    DEV_BYPASS_AUTH: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    DEV_USER_ID: z.string().default("00000000-0000-0000-0000-0000000000aa"),
  })
  .superRefine((v, ctx) => {
    if (v.DB_DRIVER === "postgres" && !v.DATABASE_URL) {
      ctx.addIssue({ code: "custom", message: "DATABASE_URL is required when DB_DRIVER=postgres" });
    }
    if (v.STORAGE_DRIVER === "supabase") {
      if (!v.SUPABASE_URL || !v.SUPABASE_SERVICE_ROLE_KEY) {
        ctx.addIssue({
          code: "custom",
          message: "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required when STORAGE_DRIVER=supabase",
        });
      }
    }
    if (v.NODE_ENV === "production" && v.DEV_BYPASS_AUTH) {
      ctx.addIssue({ code: "custom", message: "DEV_BYPASS_AUTH must be false in production" });
    }
    if (v.NODE_ENV === "production" && !v.SUPABASE_URL && !v.SUPABASE_JWT_SECRET) {
      ctx.addIssue({
        code: "custom",
        message:
          "In production set SUPABASE_URL (to verify tokens via the project JWKS — recommended) or SUPABASE_JWT_SECRET (legacy HS256)",
      });
    }
  });

export const env = Env.parse(process.env);
export type AppEnv = typeof env;
