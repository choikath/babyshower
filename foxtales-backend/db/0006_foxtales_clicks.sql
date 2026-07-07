-- FoxTales — player "FoxTales" brand-link click tracking (migration 006).
-- Adds a counter for taps on the "FoxTales" link in the player-page footer
-- (the one that points at foxtaleclub.com on a story's /play/:token page).
-- Mirrors the note_cta_clicks counter added in 0003_voice_notes.sql.
--
-- Apply order: 0001, 0002, 0003, 0004, 0005_events.sql, 0006_foxtales_clicks.sql
-- Run against the BACKEND's Postgres (the Supabase database the Fly service uses),
-- e.g. `psql "$DATABASE_URL" -f db/0006_foxtales_clicks.sql` or the Supabase SQL
-- editor. Idempotent (`if not exists`), so re-running is safe.

-- Track how many people tapped the "FoxTales" brand link on a story's player page.
alter table stories
  add column if not exists foxtales_clicks int not null default 0;
