-- FoxTales — real play + true listening-time tracking (migration 007).
--
-- Background: `stories.play_count` (0001_init.sql) is incremented on every resolve
-- of /p/:token, which for the web player fires on *page load* (the player's JS
-- auto-fetches the signed stream). So play_count is really an "opened the player
-- link" counter, and the old "minutes listened" figure was an ESTIMATE
-- (play_count × duration_sec), not measured playback.
--
-- We can't cleanly reclassify historical opens into real plays, so this migration
-- LEAVES play_count untouched (kept as the opens/resolve signal) and adds two new
-- columns that accumulate accurately from here on:
--   - play_started_count : real plays — bumped when the audio `play` event fires
--                          (once per player-page load; see POST /play/:token/play-started)
--   - listened_ms        : true accumulated playback time in milliseconds, reported
--                          by the player as it actually plays (POST /play/:token/listened)
--
-- Apply order: 0001..0005, 0006_foxtales_clicks.sql, 0007_real_plays.sql
-- Run against the BACKEND's Postgres (the Supabase database the Fly service uses),
-- e.g. `psql "$DATABASE_URL" -f db/0007_real_plays.sql` or the Supabase SQL editor.
-- Idempotent (`if not exists`), so re-running is safe.

alter table stories
  add column if not exists play_started_count int  not null default 0,
  add column if not exists listened_ms        bigint not null default 0;
