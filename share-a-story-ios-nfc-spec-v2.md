# Share a story — Implementation Spec v2 (Supabase + Fly, as built)

**Status:** as-built. This documents the system that is actually running, not a forward design.
**Relationship to v1 (`share-a-story-ios-nfc-spec.md`):** v1 is the design + decision record for the full product (iOS app, App Clip, NFC tap-to-play, phasing). v2 describes the slice that exists and runs today: a **web recorder** wired to a **Node/Express backend on Fly** backed by **Supabase** (Postgres + Auth + Storage), with the **capability-card + resolver** machinery and the **server-side ffmpeg stitch pipeline** fully implemented. The branded **web player** is both the Safari fallback from v1 §1.2 *and* the current primary playback surface. Native iOS, the App Clip, in-app NFC writing, push, offline, and bedtime-playlist cards are **deferred** (see §15).

The v1 decisions are honored, not revisited: capability token on the card (Decision 1), server-side stitching (Decision 2/2.5), web recorder as the storyteller surface (Decision 3), and Option C card binding — locked tag, card-identity token, server-side indirection (Decision 4). Where v1 says "the app," this build substitutes "the web player" until native ships.

---

## 1. System overview

Three surfaces, one backend:

```
  Storyteller (web recorder, foxtales-app.html)
        │  record → one finished MP3 (client-side encode)
        ▼
  ┌─────────────────────────────────────────────────────────┐
  │  Backend  (Node 22 + Express, Docker, on Fly: sjc)        │
  │   /api/*  (per-route auth*)     create→upload→stitch→mint │
  │   /p/:token /play/:token /.well-known/... (public)        │
  └───────────────┬───────────────────────┬──────────────────┘
                  │                        │
        Supabase Postgres          Supabase Storage (private bucket `audio`)
        (families, users,          raw parts + audio.mp3 + peaks.json,
         memberships, stories,     served only via short-lived signed URLs
         cards, invites)
                  ▲
                  │  tap NFC card →  https://<base>/p/<token>
        Child / family (web player, or future iOS app/App Clip)
```

The core loop the build delivers end to end: **record → server-finalized story → minted capability card → tap to play.**

> \*Auth is **per-route** (§5), not a blanket gate. Most `/api` routes require a Supabase Bearer token; the four contributor routes (story create/stitch, card mint/link) accept **anonymous** writes for families on the `PUBLIC_CONTRIB_FAMILY_IDS` allowlist (§5.4), so a relative recording from a share link never has to make an account.

Two swappable driver axes keep the same code runnable with zero external services for a demo and production-real against Supabase:

| Axis | Values | Demo default | Production |
|---|---|---|---|
| `DB_DRIVER` | `postgres` \| `memory` | `memory` | `postgres` (Supabase) |
| `STORAGE_DRIVER` | `supabase` \| `local` | `local` (signed local media) | `supabase` (private bucket) |

---

## 2. Deployment topology

| Component | Value |
|---|---|
| Backend host | Fly.io app `foxtales-backend`, region `sjc`, `https://foxtales-backend.fly.dev` |
| Build | Dockerfile (multi-stage `node:22-slim`); **ffmpeg installed into the runtime image** for the stitch pipeline |
| Listen port | `8080` (`ENV PORT=8080`, `EXPOSE 8080`; `env.PORT` default 8080) |
| Health | `GET /healthz` → `{ ok, dbDriver, storageDriver }` |
| Process model | single web process; `fly.toml` `auto_stop_machines="stop"`, `min_machines_running=0` (free-tier; first request after idle cold-starts) |
| Database | Supabase Postgres (project ref `mhhqftrkitwjqripelvl`), reached over the **transaction pooler (port 6543)** via `DATABASE_URL` |
| Storage | Supabase Storage **private** bucket `audio` |
| Auth | Supabase Auth (Sign in with Apple enabled; email magic-link / one-time code) |

### 2.1 `fly.toml` (as shipped)

```toml
app = "foxtales-backend"
primary_region = "sjc"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0
  processes = ["app"]

  [[http_service.checks]]
    interval = "30s"
    timeout = "5s"
    grace_period = "10s"
    method = "GET"
    path = "/healthz"
```

### 2.2 Required Fly secrets

| Secret | Purpose | Notes |
|---|---|---|
| `DATABASE_URL` | Postgres connection | Supabase **transaction pooler** URI, port 6543 |
| `SUPABASE_URL` | project origin | enables JWT verification via the project JWKS (`/auth/v1/.well-known/jwks.json`) |
| `SUPABASE_SERVICE_ROLE_KEY` | server-side Storage + DB | **legacy `service_role` JWT** (`eyJ…`), *not* a `sb_secret_…` key; never shipped to a client |
| `SUPABASE_JWT_SECRET` | legacy HS256 fallback only | optional for this project (its user tokens are asymmetric — see §5.1); harmless to leave set |
| `DB_DRIVER=postgres`, `STORAGE_DRIVER=supabase` | select real drivers | |
| `PUBLIC_BASE_URL` | the origin cards point at | tokens are written as `${PUBLIC_BASE_URL}/p/<token>`; also the redirect target for the Safari player |
| `PUBLIC_CONTRIB_FAMILY_IDS` | open the anonymous storyteller flow | comma-separated family UUIDs whose contributor routes accept unauthenticated writes (§5.4). Required only to enable the share-link/no-account path; set to the bootstrap `FAMILY_ID`. Unset ⇒ all `/api` routes stay token-gated |

---

## 3. Configuration (environment)

Validated by Zod at boot (`env.ts`); the process refuses to start on an invalid combination.

| Var | Default | Meaning |
|---|---|---|
| `NODE_ENV` | `development` | `development` \| `production` \| `test` |
| `PORT` | `8080` | listen port |
| `PUBLIC_BASE_URL` | `http://localhost:8080` | public HTTPS origin for capability URLs |
| `PUBLIC_CONTRIB_FAMILY_IDS` | `""` (empty) | comma-separated family UUIDs whose contributor routes accept anonymous writes (§5.4); empty ⇒ every `/api` route stays token-gated |
| `DB_DRIVER` | `memory` | `postgres` \| `memory` |
| `DATABASE_URL` | — | required when `DB_DRIVER=postgres` |
| `STORAGE_DRIVER` | `local` | `supabase` \| `local` |
| `AUDIO_BUCKET` | `audio` | private bucket name |
| `SIGNED_URL_TTL_SEC` | `600` | stream URL lifetime — 10 min (v1 §1.1) |
| `SUPABASE_URL` | — | required when `STORAGE_DRIVER=supabase`; also used for JWKS |
| `SUPABASE_SERVICE_ROLE_KEY` | — | required when `STORAGE_DRIVER=supabase` |
| `SUPABASE_JWT_SECRET` | — | legacy HS256 verification key |
| `LOCAL_MEDIA_DIR`, `LOCAL_SIGNING_SECRET` | `./.media`, dev secret | local storage driver only |
| `APPLE_TEAM_ID`, `IOS_BUNDLE_ID`, `APPCLIP_BUNDLE_ID`, `ITUNES_APP_ID` | placeholders | AASA / Smart App Banner (v1 §1.2) — for when native ships |
| `TRUST_PROXY` | `1` | proxy hops in front (CDN/LB) for correct `req.ip` |
| `DEV_BYPASS_AUTH`, `DEV_USER_ID` | `false`, fixed uuid | dev-only auth short-circuit; **blocked in production** by a Zod refinement |
| `CORS_ALLOW_ORIGIN` | `*` | pin to one origin if desired (read directly from `process.env`) |

Boot-time refinements: `postgres` requires `DATABASE_URL`; `supabase` requires `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; production forbids `DEV_BYPASS_AUTH=true` and requires at least one of `SUPABASE_URL` / `SUPABASE_JWT_SECRET`.

---

## 4. Data model

Postgres schema (`db/0001_init.sql`). Columns are snake_case in the DB; the TypeScript domain types (`types.ts`) mirror them in camelCase. Apply order is **`0001_init.sql` then `0002_rls.sql`**. **Apply to a clean database:** every statement is `create table if not exists`, which is a silent no-op on a table that already exists — even one with entirely different columns — so running this over an earlier prototype's tables leaves them on the old schema and surfaces as `column "…" does not exist` at runtime (see §15.3).

| Table | Columns (types abbreviated) |
|---|---|
| `families` | `id uuid pk`, `name text`, `child_name text?`, `created_at` |
| `users` | `id uuid pk → auth.users(id) on delete cascade`, `apple_sub text unique?`, `email text unique?`, `display_name?`, `created_at` |
| `memberships` | `family_id → families`, `user_id → users`, `role text check (owner\|member)`, `created_at`, **pk (family_id, user_id)** |
| `stories` | `id uuid pk`, `family_id → families`, `from_name text`, `from_user_id → users?`, `title text`, `author?`, `note?`, `duration_sec numeric?`, `parts int =1`, `audio_key text?`, `peaks_key text?`, `status text check (processing\|ready) =processing`, `in_bedtime bool =false`, `bedtime_order int?`, `play_count int =0`, `created_at` |
| `cards` | `id uuid pk`, `family_id → families`, `story_id → stories on delete set null` (binding lives here — Option C), `token text unique`, `locked bool =false`, `last_tapped_at?`, `revoked_at?` (kill switch), `created_at` |
| `invites` | `token text pk`, `family_id → families`, `role check (owner\|member)`, `expires_at`, `created_at` — table exists; endpoints are a TODO |

Indexes: unique `cards(token)` (the resolver hot path), `cards(family_id)`, `cards(story_id)`, `stories(family_id, created_at desc)`, `memberships(user_id)`.

**Auth → app user sync.** A `security definer` trigger `on_auth_user_created` runs `handle_new_user()` after every insert into `auth.users`, inserting `public.users(id, email)` (on conflict do nothing). So the first time someone signs in (Apple or magic-link/code), their `public.users` row appears automatically — this is why family bootstrap (§11.4) is run *after* a first sign-in.

`from_user_id` is **nullable by design**: an anonymous share-link contributor (§5.4) has no `public.users` row, so the story is stored with `from_user_id = null` and attribution rides entirely on the free-text `from_name` ("read by Auntie Katherine"). A signed-in contributor still records their id.

---

## 5. Auth & authorization

### 5.1 Token verification (`auth.ts`)

Auth is applied **per route**, not as a single gate on `/api` (see §5.4 for why). Most `/api` routes carry `requireAuth`, which demands a Supabase access token as `Authorization: Bearer <jwt>`; the four contributor routes carry `optionalAuth` instead. Token verification (used by both) tries two methods so it works on either Supabase project style:

1. **Asymmetric (default for projects created after May 2025):** verify against the project JWKS at `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` (RS256/ES256), fetched and cached by `jose`. This project was created in 2026, so its user session tokens are asymmetric and **must** verify via this path.
2. **Legacy symmetric:** if JWKS verification fails (or no `SUPABASE_URL`), fall back to HS256 using `SUPABASE_JWT_SECRET`.

On success, `req.userId` is pinned to the token's `sub` — which equals `auth.users.id` and therefore `public.users.id`. Failures: `missing_bearer_token` (401), `auth_not_configured` (500, neither method configured), `invalid_token` (401). `DEV_BYPASS_AUTH` short-circuits to `DEV_USER_ID` in dev only.

`optionalAuth` is the same verification with the 401 removed: a valid token pins `req.userId` (so a signed-in contributor is still recorded), an absent or bad/expired token simply leaves `req.userId` undefined and the request continues as anonymous. It grants nothing on its own — the handler still authorizes via §5.4.

> **Deployment note (the one that bites):** this project's user session tokens are **asymmetric** (created in 2026; RS256), so they verify *only* via the JWKS path. Two things must hold: `SUPABASE_URL` is set on Fly, and the JWKS URL is the correct `/auth/v1/.well-known/jwks.json`. Get either wrong and every `/api` call 401s — which looks like "signed in but nothing works." `SUPABASE_JWT_SECRET` (HS256) does **not** help here, because asymmetric tokens never match a symmetric secret.

### 5.2 Family roles

`assertFamilyRole(userId, familyId, allowedRoles[])` loads the membership and enforces it: `not_a_family_member` (403) or `insufficient_role` (403). Role matrix as enforced by the routes:

| Capability | owner | member |
|---|---|---|
| Inbox list, story stream, card list | ✓ | ✓ |
| Create story, upload, stitch | ✓ | ✓ |
| Mint card, link/lock/revoke card | ✓ | — |

For families on the public-contributor allowlist (§5.4), **create story / upload / stitch** and **mint card / link card** are additionally reachable with **no authentication** at all (the share-link path); card **lock** and **revoke**, the inbox, and the stream stay owner/member-gated regardless.

### 5.3 RLS (defense in depth)

`0002_rls.sql` enables Row Level Security on every table. The Node service connects with the **service-role key, which bypasses RLS**, and does its own auth + role checks — so RLS exists to protect *direct* client access to Postgres (e.g. if the future iOS app ever queries via the anon key). `security definer` helpers `is_member(fam)` / `is_owner(fam)` avoid recursive policy evaluation; policies grant members select/insert on stories, owners delete/manage, etc.

### 5.4 Public contributor (anonymous share-link writes)

The storyteller wedge (v1 §2.2) is that a grandparent recording from a share link must **not** be forced through account creation. To honor that on the web build, four routes are opened to unauthenticated writes — but **scoped to an explicit allowlist of families**, never globally.

- **The lever:** `PUBLIC_CONTRIB_FAMILY_IDS` (§3), a comma-separated list of family UUIDs. `isPublicContribFamily(id)` checks membership in that set (parsed once at boot, case-insensitive). Empty list ⇒ nothing is public; this is the safe default.
- **The gate:** the four contributor routes call `authorizeContribution(req, familyId, roles)` instead of `assertFamilyRole`. If the target family is on the allowlist it returns immediately (anonymous write allowed, no role check); otherwise it is **identical to the old behavior** — 401 if no verified token, then the role check. So opening one family changes nothing for any other.
- **The routes** (all carry `optionalAuth` + the per-IP limiter): `POST /api/stories`, `POST /api/stories/:id/stitch`, `POST /api/cards`, `POST /api/cards/:id/link`. The family each authorizes against: request body for `stories`/`cards`, the story's `family_id` for `stitch`, the card's `family_id` for `link` (which still enforces `story_not_in_family`). Anonymous stories persist with `from_user_id = null` (§4).
- **Still gated, always:** `GET /api/stories` (inbox), `GET /api/stories/:id/stream`, `GET /api/cards`, `POST /api/cards/:id/lock`, `POST /api/cards/:id/revoke` keep `requireAuth` + role. The owner signs in at `/admin` to see and manage what arrives; reading the family's library is never anonymous.
- **Abuse surface:** an unauthenticated write endpoint is a spam vector, so the four routes are rate-limited per IP (§8.3). Tokens minted by an anonymous `POST /api/cards` are blank capability cards scoped to the one family and carry no account access (v1 Decision 1); a bad one is revocable.

> Because auth moved per-route, the `/api` mount must **not** apply a blanket `requireAuth` (it would 401 the anonymous contributor before `optionalAuth` runs). The mount keeps only `express.json`; each route declares its own `requireAuth`/`optionalAuth`. Any **new** `/api` route must therefore declare its own auth — there is no global net.

---

## 6. Storage & media

`STORAGE_DRIVER=supabase` (`storage/supabase.ts`) uses the service-role key against the **private** `audio` bucket. Access is exclusively via signed URLs minted server-side.

### 6.1 Deterministic key layout

```
families/{familyId}/stories/{storyId}/raw/part-{i}.m4a
families/{familyId}/stories/{storyId}/raw/intro.m4a      (optional)
families/{familyId}/stories/{storyId}/raw/outro.m4a      (optional)
families/{familyId}/stories/{storyId}/raw/chime.m4a      (optional)
families/{familyId}/stories/{storyId}/audio.mp3          (final stitched)
families/{familyId}/stories/{storyId}/peaks.json         (waveform)
```

### 6.2 Signed URLs

| Kind | Method | TTL | Notes |
|---|---|---|---|
| Upload | `PUT` | ~2h, single-use | `createSignedUploadUrl`; token embedded in the URL; client `PUT`s the bytes directly (browser uses `content-type` + `x-upsert: true`) |
| Stream | `GET` | `SIGNED_URL_TTL_SEC` (600s) | `createSignedUrl`; HTTP Range supported; the real object location never leaves the server |

The raw key extension is `.m4a` by convention, but the stitcher probes content rather than trusting the extension — so the web recorder's MP3 bytes written to a `part-0.m4a` key decode correctly.

---

## 7. Stitch pipeline (`stitch.ts`)

One ffmpeg pipeline serves the web recorder today and the future iOS recorder, run **inline** in the stitch request (fine for short bedtime stories; the README flags moving to a job queue for long recordings). It is fully re-renderable later (new chime, loudness fix) without asking the sender to re-record — the reason it lives server-side (v1 §2.5).

Per-segment and assembly steps:

1. **Edge-trim** each speech segment: `silenceremove` (start) → `areverse` → `silenceremove` → `areverse`, threshold `-50dB`, peak detection. The chime is **not** trimmed.
2. Normalize every segment to mono `pcm_s16le` @ 48 kHz intermediate.
3. **Concat in order** with **0.35s** silence gaps; between parts insert `gap → chime → gap` when a chime is present. Intro is prepended, outro appended (each with a gap).
4. **Loudness**: `loudnorm=I=-16:TP=-1.5:LRA=11`.
5. **Encode**: `libmp3lame -b:a 64k -ac 1 -ar 44100` → `audio.mp3`.
6. **Waveform**: decode to 8 kHz mono PCM, reduce to **400 buckets** of normalized peak magnitude (rounded to 3 decimals) → `peaks.json` (`{version:1, count, peaks[]}`), used by the player scrub bar.
7. Duration via `ffprobe`; `markStoryReady` sets `audio_key`, `peaks_key`, `duration_sec`, `parts`, flips `status` → `ready`. (TODO: APNs push "a new story arrived.")

**Single-part behavior** (what the current web recorder hits): with `parts:[oneKey]` and no chime, there is no inter-part gap or chime — the pipeline reduces to edge-trim → loudnorm → MP3 + peaks. This is why the web app can pre-stitch client-side and still go through the same server path (§11.2).

---

## 8. Capability cards & token resolution

Option C, exactly as v1 Decision 2 specifies: the tag stores only an opaque token that identifies a **card**; the card→story binding lives in Postgres and is revocable.

### 8.1 Token (`token.ts`)

22-character base62 (`A–Za–z0–9`), drawn from a CSPRNG with rejection sampling (reject byte values ≥248) for an unbiased uniform draw — ≈ 2^130.9 of entropy. The token names a card, never a story directly and never an account. The resolver structurally validates `^[0-9A-Za-z]{22}$` before any DB hit.

> Note: the project file `foxtales-mint-card.sql` (a 32-char hex token written for a Supabase **Edge Function** at `/functions/v1/p/…`) reflects an earlier resolver design and is **superseded** by this backend. Canonical minting is `POST /api/cards` (or the seed), producing 22-char base62 tokens that satisfy the resolver's shape check. A confirmed-working demo token is `BxQ1YdnZQsMJuVFWhAxfxy` at `https://foxtales-backend.fly.dev/p/BxQ1YdnZQsMJuVFWhAxfxy`.

### 8.2 Resolution (`resolve.ts`) and the resolver endpoint (`/p/:token`)

`resolveToken(token, {bump})` returns a discriminated state: `not_found`, `revoked`, `unlinked` (card exists, no story), `processing` (story not yet `ready`), or `ready`. On a real play it bumps `last_tapped_at`. `/p/:token` is the two-faced capability URL from v1 §1.1:

- **`Accept: application/json`** (or `?format=json`) → JSON for a native client (App Clip / app), with status codes per state (see §10).
- **Otherwise** → `302` to `${PUBLIC_BASE_URL}/play/<token>`, the branded web player (the Safari fallback that re-resolves as JSON).

Revocation is the kill switch (`revoked_at` → `410`). Re-pointing a card is allowed but deliberate (owner-only `link`).

### 8.3 Rate limiting (`ratelimit.ts`)

Public endpoints get a coarse per-IP ceiling of **120/min**; `/p/:token` additionally gets a per-token limiter of **30/min** (a single card hit dozens of times a minute is abuse, not bedtime), keyed by token, falling back to IP. The four public-capable contributor routes (§5.4) also carry the per-IP limiter, since an anonymous write endpoint is a spam vector.

---

## 9. HTTP API reference

### 9.1 Public (no auth)

| Method · Path | Behavior |
|---|---|
| `GET /healthz` | `{ ok:true, dbDriver, storageDriver }` |
| `GET /.well-known/apple-app-site-association` | JSON, no redirect; `applinks.details[].appID` with `paths:["/p/*"]` and `appclips.apps:[clipAppId]` from `APPLE_*`/`*_BUNDLE_ID` |
| `GET /p/:token` | capability resolver (§8.2). JSON `ready` →`{ story:{id,title,author,fromName,note,durationSec,peaksUrl}, stream:{url,expiresAt} }`; `404 not_found` / `410 revoked` / `409 unlinked` / `202 processing`. Rate-limited per IP + per token. |
| `GET /play/:token` | branded letterpress web player HTML (re-resolves via the JSON face) |
| `GET/PUT /_local-media/*` | dev only, present when `STORAGE_DRIVER=local`; HMAC-signed local stand-in for Supabase signed URLs |

### 9.2 API routes (`/api`, `express.json` 1 MB; per-route auth)

Most rows require a Bearer token (`requireAuth`). The four rows marked **†** instead use `optionalAuth` and accept anonymous writes for allowlisted families (§5.4).


| Method · Path | Role | Body → Response |
|---|---|---|
| `POST /api/stories` | owner/member **†** | `{familyId, fromName(1–80), title(1–120), author?, note?, parts(1–20), wantsIntro?, wantsOutro?, wantsChime?}` → `201 {story:{id,status}, audioKey, peaksKey, uploads:{parts:[{index,key,url,method:"PUT"}], intro?, outro?, chime?}}` |
| `POST /api/stories/:id/stitch` | owner/member **†** | `{parts:[key,…](1–20), intro?, outro?, chime?}` → runs ffmpeg → `{story:{id,status:"ready",durationSec}}`; `404 story_not_found` |
| `GET /api/stories?familyId=…` | owner/member | → `{stories:[{id,title,author,fromName,status,durationSec,parts,playCount,createdAt}]}` |
| `GET /api/stories/:id/stream` | owner/member | → `{url,expiresAt}` signed MP3 URL; `404 story_not_found`; `409 story_not_ready` (status≠ready or no audioKey). *Resolves a **story** by id with membership — distinct from `/p/:token` which resolves a **card** with no auth.* |
| `POST /api/cards` | **owner †** | `{familyId}` → `201 {cardId, token, capabilityUrl}` |
| `GET /api/cards?familyId=…` | owner/member | → `{cards:[{id,token,capabilityUrl,storyId,storyTitle,locked,revoked,lastTappedAt,createdAt}]}` |
| `POST /api/cards/:id/link` | **owner †** | `{storyId}` → `{card:{id,storyId}}`; `404 card_not_found`; `400 story_not_in_family` |
| `POST /api/cards/:id/lock` | **owner** | → `{card:{id,locked:true}}` (records the on-device CoreNFC write-lock) |
| `POST /api/cards/:id/revoke` | **owner** | → `{card:{id,revoked:true}}` (kill switch) |

**†** Also reachable **unauthenticated** when `familyId` is on `PUBLIC_CONTRIB_FAMILY_IDS` (§5.4): no token ⇒ anonymous write; a non-allowlisted family ⇒ `401 missing_bearer_token` then the normal role check. Rate-limited per IP.

**Errors** are uniform JSON `{error: <code>}`: `HttpError` → its status/code; `ZodError` → `400 {error:"invalid_request", details}`; unmatched route → `404 {error:"not_found"}`; uncaught → `500 {error:"internal_error"}`.

### 9.3 CORS (`index.ts`)

A permissive middleware reflects `CORS_ALLOW_ORIGIN || "*"` with `Vary: Origin`, methods `GET,POST,OPTIONS`, allowed headers `authorization, content-type, x-upsert`, `Max-Age 86400`, and answers preflight `OPTIONS` with `204`. Bearer-token auth (no cookies) keeps this safe for the gated routes — an unauthenticated origin still can't read the inbox or stream without a valid user token. The one deliberate exception is the §5.4 contributor routes, which accept anonymous writes but only into allowlisted families and only under the per-IP limiter. The browser recorder calls `/api` from its own origin (possibly `file://`, localhost, or another host), so these headers are required.

---

## 10. End-to-end flows

### 10.1 Record → story → card (the contributor loop)

1. Recorder produces one finished MP3 client-side and calls `saveStory`.
2. `POST /api/stories` with `parts:1` → returns one signed `PUT` URL (`part-0.m4a`).
3. Browser `PUT`s the MP3 to that URL (`content-type` + `x-upsert:true`).
4. `POST /api/stories/:id/stitch` with `parts:["…/part-0.m4a"]` → server trim + loudnorm + peaks → `status:ready`.
5. `POST /api/cards` → `POST /api/cards/:id/link {storyId}` → `capabilityUrl` surfaced on the done screen as the tap URL.

When the recorder's `FAMILY_ID` is on the allowlist (§5.4), every call above runs **without a token** — a share-link contributor records and sends with no account. Steps 2 and 4 only need a token for a non-allowlisted family.

### 10.2 Tap → play

- **Web (today / Safari fallback):** tap card → iOS banner → `/p/:token` `302` → `/play/:token` branded player → press play (web autoplay requires a gesture, v1 §6).
- **Native (deferred):** the same Universal Link opens the app/App Clip, which calls `/p/:token` with `Accept: application/json`, gets the signed stream, and may autoplay (v1 §6). AASA already advertises `/p/*` and the App Clip.

---

## 11. Web recorder front-end (`foxtales-app.html`)

A single-file HTML app, letterpress brand. It records and **stitches one MP3 client-side** (lamejs MP3 encoder, mono 64k; WAV fallback), then sends it to the backend.

### 11.1 Pluggable backends

Three implementations behind one interface (`loadIndex`, `setChildName`, `saveStory`, `getAudioBlob`, `setBedtime`, `deleteStory`):

- `LOCAL` — offline/demo store.
- `SUPA` — direct Supabase.
- `API` — **the Fly backend; preferred whenever wired** (`API_ON = SB_ON && sb && API_BASE`). Selected by `const Backend = API_ON ? API : (USING_SUPA ? SUPA : LOCAL)`.

Config block: `API_BASE='https://foxtales-backend.fly.dev'`, `FAMILY_ID='00000000-0000-0000-0000-0000000000a1'` (must match the bootstrap SQL).

### 11.2 Mapping the finished MP3 onto the multi-part backend (the `parts=1` decision)

The backend's contract is multi-part (raw parts + server stitch), built for a future multi-part recorder. The current web recorder already produces a finished MP3, so it maps onto the backend as a **single part**: create with `parts:1`, `PUT` the MP3 to `part-0`, stitch `["part-0"]`. The server "stitch" of one file is the edge-trim + loudnorm + **peaks generation the player needs**. Cost: one extra lossy MP3 re-encode — acceptable for the prototype, and it keeps a single server pipeline for web and (future) native.

### 11.3 Auth (email one-time code)

Sign-in uses Supabase **email one-time code**: `signInWithOtp({email})` → `verifyOtp({email, token, type:'email'})`. Chosen over magic-link redirect so it works whether the page is opened from `file://`, localhost, or a host. A small letterpress modal handles email → numeric code; the code input accepts 6–10 digits to match Supabase's configurable **Email OTP Length** (the project currently sends 8). Sign-in is **no longer required to record and send**: the `ensureAuthed()` gate was removed from `saveStory`, which now runs unauthenticated against the fixed `FAMILY_ID` (paired with the backend allowlist, §5.4), so a contributor opening the share link never sees a login. `ensureAuthed()` still gates the inbox/admin surface. `_api()` attaches the Bearer token when one is present, refreshing if it's within 60s of expiry; `onAuthStateChange` keeps the session cached. **Requires** the Supabase Magic Link email template to include `{{ .Token }}` so the code is delivered.

### 11.4 Family bootstrap

No create-family endpoint; instead a fixed `FAMILY_ID` is baked into the app and a one-time SQL file (`foxtales-bootstrap-family.sql`) inserts the family row and an **owner** membership keyed on the signed-in email. Run **after** a first sign-in (so the trigger has created `public.users`).

### 11.5 Wired vs not

| Surface | Status |
|---|---|
| Inbox list (`loadIndex` → `GET /api/stories`, filter `ready`) | ✓ |
| Play (`getAudioBlob` → `GET /api/stories/:id/stream` → fetch blob) | ✓ |
| Download for offline | ✓ |
| Send (record → story → card → tap URL) | ✓ |
| Star / bedtime toggle, Delete | **not wired** — throw sentinels, surface a generic toast; easy follow-up endpoints |

---

## 12. Security & privacy posture

- **Private by default.** Storage bucket is private; objects are reachable only via short-lived signed URLs. The real media location is never on the tag or in client hands.
- **Capability scoping.** A card token streams one story and nothing else — no account access (v1 Decision 1). Revocation (`/cards/:id/revoke`) kills a lost card without touching the physical tag.
- **Service-role isolation.** The service-role key lives only on the server; RLS is enabled as defense-in-depth for any future direct-DB client.
- **Bearer-only auth** (no cookies) makes permissive CORS safe.
- **Scoped anonymous contribution.** The storyteller flow accepts unauthenticated writes, but only to families on `PUBLIC_CONTRIB_FAMILY_IDS` and only on four create/link routes (§5.4); reading a family's library (inbox, stream) and destructive card ops (lock, revoke) always require membership. Anonymous stories carry no user id (`from_user_id` null), the writes are per-IP rate-limited, and minted card tokens grant single-story playback only — no account reach. Default is closed (empty list).
- **Rate limiting** per IP and per token blunts token-guessing / hammering.
- **Hard-delete** is supported at the storage layer for delete-on-request (v1 §2.6).

---

## 13. Implemented vs deferred (mapping to v1 phasing)

**Implemented now (Supabase + Fly):**
- Backend shell, Supabase-JWT auth (per-route), family/role model, RLS — plus scoped anonymous share-link contribution for allowlisted families (§5.4).
- Inbox, story stream, branded web player (the v1 §1.2 Safari fallback, doubling as the current player).
- Universal-Link resolver `/p/:token` (both faces) + AASA.
- Server-side stitch pipeline (one pipeline, re-renderable).
- Capability cards: mint, link, lock-record, revoke, `lastTappedAt`, rate limiting.
- Web recorder wired through the full loop, with email-code auth.

**Deferred (native, per v1 Part 2 / Decision 6):**
- iOS app (SwiftUI) and/or **App Clip** for instant native autoplay — gated on the App-Clip background-audio spike (v1 §6).
- In-app NFC **writing/locking** (CoreNFC `NFCNDEFReaderSession`, write → read-back → confirm → lock).
- APNs push ("a new story arrived"), reliable offline downloads, child mode.
- Bedtime **playlist** and playlist-bound cards (the schema's card→target indirection already allows it; `in_bedtime`/`bedtime_order` columns exist; inbox star/delete endpoints still TODO).
- Multi-part **in-app recording** (the backend's native multi-part path is already built; only the client is pending).

---

## 14. Operational notes

- **Local dev, zero services:** defaults (`DB_DRIVER=memory`, `STORAGE_DRIVER=local`) run the whole API with HMAC-signed local media at `/_local-media/*`. A stitch self-test exists (`stitch.ts --selftest`) that synthesizes parts and verifies a valid MP3 + waveform.
- **Migrations:** run `0001_init.sql` then `0002_rls.sql` in the Supabase SQL editor. Bucket `audio` must be created **private**. Enable the Apple auth provider (leave the OAuth secret empty for the magic-link/code flow) and add `{{ .Token }}` to the Magic Link email template.
- **Cold start:** with `auto_stop_machines="stop"` + `min_machines_running=0`, the first request after idle wakes the machine (a few seconds). Bump `min_machines_running` to keep it warm (runs continuously).
- **Deploy:** `fly deploy --remote-only` from the folder containing `Dockerfile` + `fly.toml`; ensure the secrets in §2.2 are set first (`SUPABASE_URL` especially — it's what makes asymmetric token verification work).
- **Bring-up order:** deploy backend → sign in once in the app → run `foxtales-bootstrap-family.sql` with that email → record a story → open the tap URL.

---

## 15. Deployment pitfalls & first-bring-up checklist (lessons from initial deploy)

Every item below cost real debugging time on the first live bring-up. A future implementation should treat this as the pre-flight list. The errors came in this order — CORS preflight → 401 → 500 → schema — and each masked the next, so fix them in that order and re-check after each.

### 15.1 Complete Fly env — set *all* of these before first use

The drivers default to a zero-dependency demo mode, and that is the single most confusing trap: the app boots fine, serves `/healthz`, and even plays a seeded demo card — all while ignoring Supabase entirely (in-memory DB + local disk). Anything done in Supabase (schema, bootstrap rows, uploads) is then invisible to the app. The driver vars are **not optional**:

```
fly secrets set \
  DB_DRIVER=postgres \
  STORAGE_DRIVER=supabase \
  SUPABASE_URL=https://<ref>.supabase.co \
  SUPABASE_SERVICE_ROLE_KEY='eyJ...' \
  DATABASE_URL='postgresql://postgres.<ref>:<password>@<pooler-host>:6543/postgres' \
  PUBLIC_BASE_URL=https://<app>.fly.dev \
  -a <app>
```

`SUPABASE_SERVICE_ROLE_KEY` is the legacy `service_role` JWT (`eyJ…`), not a `sb_secret_…` key. `PUBLIC_BASE_URL` must be the real public origin or minted tap URLs default to `http://localhost:8080` and are useless. Then verify the drivers actually flipped — the fastest sanity check there is:

```
curl -s https://<app>.fly.dev/healthz     # want {"ok":true,"dbDriver":"postgres","storageDriver":"supabase"}
```

If it reports `memory`/`local`, the secrets didn't apply, and nothing in Supabase will be visible to the app.

### 15.2 Bring-up order (don't reorder)

1. Apply the schema to a **clean** database: `0001_init.sql` then `0002_rls.sql` (see 15.3).
2. Create the **private** `audio` Storage bucket.
3. Enable the Apple auth provider (leave its OAuth secret empty for the magic-link/code flow) and put `{{ .Token }}` in the Magic Link email template.
4. Set all Fly env (15.1) and deploy.
5. **Sign in once** in the app — this is what creates the `auth.users` row and, via the `on_auth_user_created` trigger, the `public.users` row.
6. **Only then** run the family bootstrap SQL — it inserts a membership that foreign-keys to `public.users`, so that row must already exist.
7. Record a story → the tap URL appears on the done screen.

### 15.3 Schema (the 500 / `column does not exist`)

- **`create table if not exists` is a silent no-op on a pre-existing table, even when the columns differ.** Applying `0001_init.sql` to a database that already held tables from an earlier prototype left `stories`/`cards` on the *old* schema; the new columns (`family_id`, …) were never added, and runtime inserts failed with `column "family_id" does not exist` (Postgres `42703`) long after the migration appeared to succeed.
- **Fix:** apply the schema to a clean database, or — when reusing one — drop the conflicting tables and recreate them (`foxtales-fix-stories-cards.sql` does exactly this for `stories`/`cards`, preserving `families`/`users`/`memberships`). After migrating, verify: `select column_name from information_schema.columns where table_name='stories'`.
- A `42703` always names the table + column and is schema-vs-code drift, never a data problem.

### 15.4 Auth (the 401)

- **`SUPABASE_URL` must be set on Fly**, or asymmetric token verification is impossible. Projects created after May 2025 (this one) sign user session tokens with an **asymmetric key (ES256/RS256)**, verifiable only via the project JWKS. The backend builds the JWKS verifier only when `SUPABASE_URL` is present; without it, it falls back to the HS256 shared secret, which can never verify an asymmetric token → every `/api` call 401s.
- **The JWKS path is `/auth/v1/.well-known/jwks.json`**, not `/auth/v1/jwks`. The endpoint is public (no `apikey` header) and edge-cached.
- **`SUPABASE_JWT_SECRET` (HS256) is the wrong lever for this project.** It only matters if user tokens are signed symmetrically. To check which you have, decode the access token's header `alg`: `ES256`/`RS256` ⇒ asymmetric (need JWKS + `SUPABASE_URL`); `HS256` ⇒ symmetric (need `SUPABASE_JWT_SECRET`).
- **Anonymous contributor still 401s?** If a no-token `POST /api/stories` for the bootstrap family returns `401 missing_bearer_token`, the §5.4 path isn't live: either `PUBLIC_CONTRIB_FAMILY_IDS` isn't set on Fly (or doesn't contain that exact UUID), or the `/api` mount still applies a blanket `requireAuth` ahead of the per-route `optionalAuth` (it must not — §5.4). Quick check: a no-token POST for an allowlisted family should `201`, and the same for a random UUID should `401`.

### 15.5 CORS (the preflight failure)

- The recorder is often opened from `file://`, so the browser sends `Origin: null`. The CORS middleware reflects `*` (which matches `null`) and answers `OPTIONS` with `204` (§9.3). Serving over `http://localhost` is cleaner but not required.
- **A preflight returning "no `Access-Control-Allow-Origin` header" usually does *not* mean the CORS code is wrong.** It means the running build predates the CORS middleware, **or the app crashed on boot** (a missing required env var makes the Zod config check exit the process), so Fly's proxy — not the app — is answering, with no CORS headers. Check `curl /healthz` and `fly logs` before touching CORS code.

### 15.6 Storage

- `SUPABASE_SERVICE_ROLE_KEY` must be the **legacy `service_role` JWT** (`eyJ…`), not a `sb_secret_…` key — with `supabase-js ^2.45.4` the new format can fail Storage auth (`Invalid JWT` / `createSignedUploadUrl failed`).
- The bucket must be named exactly `audio` (or override `AUDIO_BUCKET`) and be **private**.
- The browser→Supabase signed-upload `PUT` uses `content-type` + `x-upsert: true`; failures surface client-side as `upload_failed_<status>`.

### 15.7 Database connection

- Use the **Transaction pooler** URI (port 6543) with the **tenant-qualified username** `postgres.<ref>` — not bare `postgres`. URL-encode special characters in the password.
- Supabase requires TLS; the pool sets `ssl: { rejectUnauthorized: false }` for non-localhost. Unnamed prepared statements (node-postgres `pool.query(text, params)`) are compatible with the transaction pooler.

### 15.8 Fly deploy

- `fly.toml` needs an `app` name and `[build] dockerfile = "Dockerfile"`. Without the app name, deploy errors with "missing an app name"; with no `[build]`/Dockerfile in context, it errors "no Dockerfile or buildpacks configured."
- Deploy from the directory that **directly** contains `Dockerfile` + `fly.toml`. Re-unzipping into an existing folder can create a nested `foxtales-backend/foxtales-backend/`; deploying from the wrong level triggers the "no Dockerfile" error. `ls Dockerfile fly.toml` should list both.
- `auto_stop_machines="stop"` + `min_machines_running=0` means the first request after idle cold-starts. After setting secrets or deploying, confirm the deploy reports **successful** (not just that the build finished), then re-check `/healthz`.

### 15.9 Client

- **Email OTP length is configurable (6–10) in Supabase**; the client must accept a variable-length code, not hard-code 6 (the app accepts up to 10). The Magic Link template must include `{{ .Token }}` or no code is delivered.
- The generic "couldn't send to the backend" toast masks the real error; the actual cause is in the browser console (`[FoxTales] saveStory failed: …`): `unauthorized` (401 → §15.4), `api_500: …` (server threw → read `fly logs`), `upload_failed_…` (storage → §15.6), or `TypeError: Failed to fetch` (CORS/network → §15.5). Read the console first, every time.

---

## 16. Known gaps / follow-ups

1. Inbox **star (bedtime)** and **delete** are not yet wired to the backend (small endpoints + `setBedtime`/`deleteStory` implementations).
2. Stitching runs **inline** in the request — move to a job queue before long-form recordings.
3. **Invites** table exists; no invite endpoints yet.
4. The web recorder pre-stitches client-side (`parts=1`); a true multi-part web recorder would use the backend's native multi-part contract directly (no client encode).
5. Native track (App Clip / app, NFC write-lock, push, offline, child mode, playlist cards) per §13.
6. For a **sold collectible** card SKU, anti-cloning would need NTAG 424 DNA (SUN authentication) — a future fork, not a v1 concern (v1 Decision 2 caveats).
