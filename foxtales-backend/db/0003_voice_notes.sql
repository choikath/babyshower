-- FoxTales — recording-updates migration (003).
-- Adds: (a) a click counter for the player's "record a voice note" CTA, and
--       (b) a voice_notes table that backs the streamlined memo recorder
--           (/note/:token) and the admin "Voice Memo Inbox".
--
-- Plays + listening time: stories.play_count already exists (0001_init.sql) and
-- is incremented on every resolve. "Total listening time" is derived as
-- play_count × duration_sec — no extra column needed.
--
-- Apply order: 0001_init.sql, 0002_rls.sql, 0003_voice_notes.sql, 0004_voice_notes_rls.sql
-- Run against the BACKEND's Postgres (the Supabase database the Fly service uses).

-- (a) Track how many people tapped "record a voice note for {reader}" on a story's player page.
alter table stories
  add column if not exists note_cta_clicks int not null default 0;

-- (b) A voice memo recorded by a listener and sent back to the reader.
-- One row per memo. Tied to the family that owns the tapped card so it shows up
-- in that family's admin inbox. The capability token / card / story it was left
-- from are recorded for context; reader_name is the receiver (the story's reader),
-- sender_name is whoever left the memo (optional — may be left blank).
create table if not exists voice_notes (
  id              uuid primary key default gen_random_uuid(),
  family_id       uuid not null references families (id) on delete cascade,
  origin_card_id  uuid references cards (id) on delete set null,
  origin_story_id uuid references stories (id) on delete set null,
  origin_token    text,                                    -- the capability token tapped
  reader_name     text,                                    -- receiver (the story's reader)
  sender_name     text,                                    -- who left the memo (optional)
  message         text,                                    -- optional typed note
  audio_key       text,                                    -- object key in the private audio bucket
  duration_sec    numeric,
  ext             text,                                    -- recorded container ext (webm/m4a/mp4/mp3)
  status          text not null default 'processing' check (status in ('processing','ready')),
  played_at       timestamptz,                             -- when an admin first listened
  created_at      timestamptz not null default now()
);

-- Inbox query: newest memos for a family first.
create index if not exists voice_notes_family_created_idx on voice_notes (family_id, created_at desc);
create index if not exists voice_notes_story_idx on voice_notes (origin_story_id);
