-- ─────────────────────────────────────────────────────────────────────────────
-- FoxTales — bootstrap the shared prototype family
-- Run ONCE in the BACKEND's Postgres: the database the Fly service connects to
-- via DATABASE_URL — the same DB where db/0001_init.sql created the
-- families / stories / cards tables. (Not necessarily the frontend's Supabase.)
-- ─────────────────────────────────────────────────────────────────────────────
-- index.html posts every story to FAMILY_ID = 00000000-0000-0000-0000-0000000000a1.
-- For anonymous "Finish & upload" to work end-to-end the backend must:
--   (a) allowlist this family via PUBLIC_CONTRIB_FAMILY_IDS  — already set in
--       fly.toml; apply it to the running app with a redeploy (see below), and
--   (b) actually HAVE this family row — which this script creates.
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

insert into families (id, name, child_name)
values ('00000000-0000-0000-0000-0000000000a1', 'FoxTales family', '')
on conflict (id) do nothing;

-- Verify it's there:
--   select id, name from families where id = '00000000-0000-0000-0000-0000000000a1';
--
-- After running this, apply the backend config + restart so the allowlist loads:
--   cd foxtales-backend && fly deploy
--   (or, no rebuild:  fly secrets set \
--      PUBLIC_CONTRIB_FAMILY_IDS=00000000-0000-0000-0000-0000000000a1 \
--      ADMIN_EMAILS=choikath@gmail.com -a foxtales-backend )
