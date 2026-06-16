-- FoxTales schema (spec 2.3). Run on the Supabase Postgres database.
-- Apply order: 0001_init.sql, then 0002_rls.sql.

create extension if not exists pgcrypto;

-- A family is the sharing boundary — "the household", not an account.
create table if not exists families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  child_name  text,
  created_at  timestamptz not null default now()
);

-- Mirrors Supabase auth.users (id is the same uuid). Populated by the trigger below.
create table if not exists users (
  id            uuid primary key references auth.users (id) on delete cascade,
  apple_sub     text unique,
  email         text unique,
  display_name  text,
  created_at    timestamptz not null default now()
);

create table if not exists memberships (
  family_id   uuid not null references families (id) on delete cascade,
  user_id     uuid not null references users (id) on delete cascade,
  role        text not null check (role in ('owner','member')),
  created_at  timestamptz not null default now(),
  primary key (family_id, user_id)
);

create table if not exists stories (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references families (id) on delete cascade,
  from_name     text not null,
  from_user_id  uuid references users (id) on delete set null,
  title         text not null,
  author        text,
  note          text,
  duration_sec  numeric,
  parts         int not null default 1,
  audio_key     text,        -- final stitched MP3 object key (private bucket)
  peaks_key     text,        -- waveform peaks JSON object key
  status        text not null default 'processing' check (status in ('processing','ready')),
  in_bedtime    boolean not null default false,  -- bedtime list membership (spec 2.4)
  bedtime_order int,
  play_count    int not null default 0,
  created_at    timestamptz not null default now()
);

-- A card is the physical NFC tag's identity (Option C, Decision 2). The tag stores
-- only a capability token; the binding to a story lives here and is revocable.
-- (A future "playlist" target is an indirection added here; story for now.)
create table if not exists cards (
  id             uuid primary key default gen_random_uuid(),
  family_id      uuid not null references families (id) on delete cascade,
  story_id       uuid references stories (id) on delete set null,
  token          text not null unique,
  locked         boolean not null default false,   -- physical tag write-locked on device
  last_tapped_at timestamptz,
  revoked_at     timestamptz,                       -- kill switch (spec 1.4)
  created_at     timestamptz not null default now()
);

-- Family invite links (spec 2.2). Endpoints are a TODO; the table exists for them.
create table if not exists invites (
  token       text primary key,
  family_id   uuid not null references families (id) on delete cascade,
  role        text not null check (role in ('owner','member')),
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

-- Hot path: resolve a tapped token in one indexed lookup.
create unique index if not exists cards_token_idx on cards (token);
create index if not exists cards_family_idx on cards (family_id);
create index if not exists cards_story_idx on cards (story_id);
create index if not exists stories_family_created_idx on stories (family_id, created_at desc);
create index if not exists memberships_user_idx on memberships (user_id);

-- Keep public.users in step with auth.users on signup (Apple / magic-link).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
