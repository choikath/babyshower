# Recording updates — Supabase / Postgres runbook

This covers the database changes behind the four player/recording updates:

1. **Plays + listening time on the player page** — uses the existing
   `stories.play_count` (incremented on every resolve). "Total listening time" is
   *derived* as `play_count × duration_sec`, so **no schema change is required** for it.
2. **Voice-note CTA click tracking** — new column `stories.note_cta_clicks`.
3. **Streamlined voice-memo recorder + admin Voice Memo Inbox** — new table
   `voice_notes` (+ RLS).

The Node service connects with the **service-role key** and bypasses RLS, so the
app works the moment the tables/columns exist. The RLS file is defense-in-depth for
direct (anon-key) access and mirrors the existing `0002_rls.sql` conventions.

> The backend stores voice-memo audio in the **same private bucket** the stories
> use — whatever `AUDIO_BUCKET` points at on Fly (e.g. `recordings`). No new bucket
> is needed. Keys live under `families/<familyId>/voice-notes/<id>/audio.<ext>`.

---

## Apply the migrations

Run these against the **backend's** Postgres database (the one the Fly service uses,
i.e. `DATABASE_URL` — the Supabase Postgres). Order matters; `0001`/`0002` already ran
in earlier deploys, so for this change you only need `0003` then `0004`:

```bash
# from foxtales-backend/
psql "$DATABASE_URL" -f db/0003_voice_notes.sql
psql "$DATABASE_URL" -f db/0004_voice_notes_rls.sql
```

### Or via the Supabase SQL editor

Open **Supabase → SQL Editor → New query**, paste the contents of
`db/0003_voice_notes.sql`, run it, then do the same for `db/0004_voice_notes_rls.sql`.
Both are idempotent (`if not exists` / `drop policy if exists`), so re-running is safe.

---

## What each file does

### `0003_voice_notes.sql`
- `alter table stories add column if not exists note_cta_clicks int not null default 0;`
- `create table voice_notes (...)` with: `family_id`, `origin_card_id`,
  `origin_story_id`, `origin_token`, `reader_name` (receiver), `sender_name`,
  `message`, `audio_key`, `duration_sec`, `ext`, `status`, `played_at`, `created_at`.
- Indexes for the inbox query.

### `0004_voice_notes_rls.sql`
- Enables RLS on `voice_notes`.
- `select` for family members; `delete` for owners.
- **No anon insert policy on purpose** — memos are written server-side by the
  backend (service role), authorized by possession of the capability token.

---

## Env / config checklist

- **`ADMIN_EMAILS`** (backend, on Fly) must include the dashboard owner's email
  (e.g. `choikath@gmail.com`) so the Voice Memo Inbox endpoint
  (`GET /api/voice-notes`) is readable without a per-family membership row. This is
  the same allowlist the existing story inbox already uses.
- **`AUDIO_BUCKET`** must remain the private bucket used for stories. Voice memos
  reuse it; no extra bucket or policy is required.
- No change to `SUPABASE_*` keys.

---

## Quick verification

After the migration and a backend deploy:

```sql
-- column exists
select column_name from information_schema.columns
where table_name='stories' and column_name='note_cta_clicks';

-- table + policies exist
select tablename, policyname from pg_policies where tablename='voice_notes';
```

Then, end-to-end:
1. Open a `…/play/<token>` page → confirm the "Played N times · ~M min of listening"
   line near the footer, and the "Record a voice note for <reader>" button.
2. Tap the button → record → review → send on `…/note/<token>`.
3. `select sender_name, reader_name, status, created_at from voice_notes order by created_at desc limit 5;`
   should show the new `ready` row.
4. In the admin dashboard (`/admin`, signed in as an `ADMIN_EMAILS` user) the
   **Voice Memo Inbox** card should list and play it.
5. `select note_cta_clicks from stories where id = '<story-id>';` increments each
   time the CTA is tapped.
