# FoxTales — tap-to-play backend

A backend for recorded stories that play when a child taps an NFC card to a
phone. Tap a tag → a capability URL resolves → the story streams, either in an
iOS **App Clip** or the branded **Safari web player** fallback. No app install
required to listen.

This repo is the **backend + web player + database schema + iOS scaffold**. It
runs and is fully tested end-to-end (create → upload → stitch → resolve → play).
What it can't do for you — provisioning your live Supabase project, registering
the App Clip with Apple, and building/signing the iOS target — is called out
explicitly under [Boundaries](#what-this-repo-does-not-do).

## What works today

Verified by `npm run smoke` (14/14 passing) against the running server:

- Mint a capability token, link it to a story, revoke it.
- `GET /p/:token` content negotiation — JSON (signed stream) for the App Clip,
  302 to the web player for browsers.
- Short-lived **signed media URLs** (10 min) with HTTP Range support.
- The **ffmpeg stitch pipeline** — edge-trim → gaps + chime → loudnorm → MP3
  64 kbps mono → 400-bucket waveform peaks. Output verified `mp3 / 44100 Hz /
  mono / 64 kbps`.
- The branded **letterpress web player** and the not-linked / processing /
  revoked / not-found message pages.
- `/.well-known/apple-app-site-association` for Universal Links + App Clip.

## How it works

```
        tap                       Accept: application/json
  NFC card  ──────►  /p/<token>  ───────────────────────────►  { story, stream:{ signedURL } }
  (stores only                │                                        │
   the token)                 │  Accept: text/html                     ▼
                              └──────────────►  302  /play/<token>  ──►  branded web player
```

The tag stores **only** an opaque token (Option C / spec Decision 2). The token
identifies a *card*; the card→story binding lives in the database and is
revocable, so a lost card can be killed and a card can be re-pointed at a new
story without re-writing the tag. The MP3 URL is never on the tag and is only
ever handed out as a short-lived signed URL.

## Architecture — the hybrid

- **Supabase** carries Postgres (data model), Auth (**Sign in with Apple** +
  **email magic links**), and Storage (private audio bucket + signed URLs).
- **This Node service** owns the HTTP-nuanced resolver, the AASA file, the web
  player, and the ffmpeg stitch worker — the parts that don't fit an edge
  function. It talks to Supabase with the service-role key.

Two swappable drivers keep it runnable with zero external services for a demo
and production-real on Supabase:

| | demo | production |
| --- | --- | --- |
| `DB_DRIVER` | `memory` | `postgres` (Supabase) |
| `STORAGE_DRIVER` | `local` (disk + HMAC-signed URLs) | `supabase` (private bucket) |

## Repo layout

```
src/
  index.ts            server bootstrap (routes, error handling, dev media route)
  env.ts              config (zod-validated)
  token.ts            22-char base62 capability tokens (~131 bits)
  resolve.ts          token -> card -> story resolution (shared by /p and /play)
  stitch.ts           ffmpeg pipeline (+ `--selftest`)
  auth.ts             Supabase JWT verification + family role checks
  ratelimit.ts        per-IP and per-token limiters
  repo.ts / repo.*    data access — interface + memory and postgres drivers
  storage/            Storage interface + supabase and local drivers
  routes/             resolver, player, cards, stories, aasa
  views/player.ts     branded letterpress web player + message pages
db/
  0001_init.sql       schema + indexes
  0002_rls.sql        Row Level Security policies
ios-appclip/          SwiftUI App Clip scaffold (see its README)
scripts/smoke.mjs     end-to-end HTTP test
Dockerfile            multi-stage build, bundles ffmpeg for runtime
```

## Quick start (zero dependencies)

Requires Node 20+ and ffmpeg on PATH.

```bash
npm install
npm run stitch:selftest          # proves the ffmpeg pipeline on synthetic audio

# Run with in-memory DB + local disk storage + a seeded test family:
DEV_SEED=true DEV_BYPASS_AUTH=true DB_DRIVER=memory STORAGE_DRIVER=local \
  PUBLIC_BASE_URL=http://localhost:8080 LOCAL_MEDIA_DIR=./.media \
  npm start

# In another shell, exercise the whole flow:
npm run smoke
```

Then open `http://localhost:8080/play/<token>` (the smoke output prints a token)
to see the web player.

## The API

All `/api/*` routes require a Supabase access token (`Authorization: Bearer …`),
except when `DEV_BYPASS_AUTH=true`.

| Method & path | Who | Purpose |
| --- | --- | --- |
| `GET /p/:token` | public | Resolve a tapped card. JSON → signed stream; browser → 302 to player. |
| `GET /play/:token` | public | Branded web player (or a state message page). |
| `GET /.well-known/apple-app-site-association` | public | Universal Link + App Clip association. |
| `POST /api/stories` | member | Create a story; returns signed PUT upload URLs for raw parts. |
| `POST /api/stories/:id/stitch` | member | Stitch uploaded parts → final MP3 + peaks; marks story `ready`. |
| `GET /api/stories?familyId=` | member | Family inbox. |
| `POST /api/cards` | owner | Mint a card + capability token (the URL you write to a tag). |
| `POST /api/cards/:id/link` | owner | Point a card at a story. |
| `POST /api/cards/:id/lock` | owner | Record that the physical tag was write-locked. |
| `POST /api/cards/:id/revoke` | owner | Kill switch — the token stops resolving. |
| `GET /api/cards?familyId=` | member | List cards (the "My cards" screen). |

`GET /p/:token` (JSON) status codes: `200` ready, `202` processing, `409`
unlinked, `410` revoked, `404` not found.

## Production setup with Supabase

1. **Create a Supabase project.** Note the project ref and database password.
2. **Run the migrations** (SQL editor or `psql`): `db/0001_init.sql`, then
   `db/0002_rls.sql`.
3. **Create a private Storage bucket** named `audio` (Storage → New bucket →
   *uncheck* "Public"). Access is exclusively via signed URLs.
4. **Enable Auth providers:** turn on **Apple** (Authentication → Providers →
   Apple) and **email magic links** (Email provider → enable magic link). Add
   your app's redirect URLs.
5. **Collect env values** (Settings → API and Settings → Database):
   - `DATABASE_URL` — the **connection pooler** URI (port 6543) for
     containers/serverless.
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server-only — never ship to a
     client). Access tokens are verified against the project's JWKS at
     `${SUPABASE_URL}/auth/v1/jwks` (current Supabase signs them with ES256);
     only set `SUPABASE_JWT_SECRET` if your project still issues legacy HS256
     tokens.
6. Set `DB_DRIVER=postgres`, `STORAGE_DRIVER=supabase`, `AUDIO_BUCKET=audio`,
   your real `PUBLIC_BASE_URL`, and the Apple identifiers (below).

> The Node service uses the service-role key and bypasses RLS, doing its own
> auth/role checks. The RLS policies in `0002_rls.sql` protect any *direct*
> client access to the database (defense in depth).

## Deploy

The `Dockerfile` builds the TypeScript and installs **ffmpeg** in the runtime
image (the stitch step needs it). Deploy the image to any container host
(Fly.io, Render, Railway, Cloud Run). Set the env vars from above.

**AASA hosting matters:** `/.well-known/apple-app-site-association` must be served
over **HTTPS at the domain apex**, as `application/json`, with **no redirect** —
Apple fetches it directly and does not follow redirects. This service serves it
correctly; just make sure your CDN/proxy doesn't rewrite the path or
content-type.

Set the Apple identifiers so the AASA file is correct:

```
APPLE_TEAM_ID=ABCDE12345
IOS_BUNDLE_ID=app.foxtales.ios
APPCLIP_BUNDLE_ID=app.foxtales.ios.Clip
ITUNES_APP_ID=0000000000     # optional — enables the Safari Smart App Banner
```

## NFC tags

Write the capability URL returned by `POST /api/cards` to the tag:

```
https://foxtales.app/p/<token>
```

Recommended sequence (matches spec 1.3): write the URL to an NTAG, **read it
back to verify**, then **lock** the tag (one-way) and call
`POST /api/cards/:id/lock` to record it. Locking prevents anyone re-writing the
tag to point elsewhere. Any consumer NFC-writer app works for testing; the
in-app flow automates write-verify-lock.

## iOS App Clip

See [`ios-appclip/README.md`](ios-appclip/README.md). The scaffold resolves a
tapped token and plays it. Building/signing needs Xcode + an Apple Developer
account, and there's one genuine unknown to spike first: **background audio
inside an App Clip** (does playback continue when the screen locks?). The web
player is the permanent fallback, so tap-to-play works on every phone regardless.

## Security notes

- Tokens are 22-char base62 (~131 bits) from a CSPRNG with rejection sampling —
  unguessable and not enumerable.
- Media lives in a **private** bucket; clients only ever get **short-lived signed
  URLs** (default 10 min). The MP3 URL is never written to the tag.
- Cards are **revocable** (kill switch) and tags should be **locked** after
  write-verify.
- Per-token and per-IP **rate limiting** on the resolver.
- **RLS** on every table; the service uses the service-role key and enforces
  roles in code.
- Hard-delete is supported at the storage layer for delete-on-request (spec 2.6).

## What this repo does *not* do

Being direct about the edges:

- It does **not** provision your live Supabase project, create the bucket, or
  configure the Auth providers — those are dashboard steps (documented above).
- It does **not** register the App Clip experience with Apple or build/sign the
  iOS target — that needs Xcode + an Apple Developer account.
- The stitch worker runs **inline** per request — fine for short bedtime stories;
  for long recordings, move it to a job queue (a `stories` status the worker
  polls, or a Supabase webhook → worker). The pipeline code doesn't change.
- Push notifications (APNs "a new story arrived") are a marked TODO (spec
  Phase 2).

## Next steps

1. Create the Supabase project; run `db/0001_init.sql` + `db/0002_rls.sql`;
   create the private `audio` bucket; enable Apple + magic-link auth.
2. Deploy this image (Dockerfile) to a container host with the production env.
3. Point your domain at it; confirm the AASA file serves correctly over HTTPS.
4. Build the iOS app + App Clip in Xcode from `ios-appclip/`; **spike background
   audio** on a device; register the App Clip experience in App Store Connect.
5. Wire the recording UI to `POST /api/stories` (signed uploads) →
   `POST /api/stories/:id/stitch`, and the card setup to `POST /api/cards` →
   write/lock the tag → `POST /api/cards/:id/link`.
```
