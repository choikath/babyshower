-- FoxTales — analytics events (migration 005).
-- A single append-only event stream powering the recording-flow funnel + drop-off
-- analysis (focus: the "record your own way" path). Generic event + props JSONB so
-- new events need no migration. Written exclusively server-side by the Node service
-- (service role) via POST /api/events; RLS therefore has no client policies.
--
-- Apply order: ... 0003, 0004, 0005_events.sql
-- Run against the BACKEND's Postgres (the Supabase database the Fly service uses).

create table if not exists events (
  id          uuid primary key default gen_random_uuid(),
  event       text not null,                         -- 'step_viewed', 'record_started', ...
  ts          timestamptz not null default now(),    -- server receive time
  client_ts   timestamptz,                           -- event time on the device
  session_id  text,                                  -- one sitting (client uuid)
  device_id   text,                                  -- persistent device uuid (unique-user proxy)
  user_id     uuid references users (id) on delete set null,  -- usually null (public recorder)
  family_id   uuid,                                  -- not FK: tolerate unknown/anon families
  flow        text,                                  -- 'record_own' (generic; reusable later)
  step        text,                                  -- funnel step id
  props       jsonb not null default '{}'::jsonb,    -- event-specific payload
  ua          text,                                  -- server-stamped user-agent
  ip_hash     text,                                  -- server-stamped HMAC of IP (no raw IP)
  source      text not null default 'client'         -- 'client' | 'server'
);

create index if not exists events_event_ts_idx   on events (event, ts desc);
create index if not exists events_session_idx     on events (session_id);
create index if not exists events_device_idx      on events (device_id);
create index if not exists events_flow_step_idx   on events (flow, step, ts desc);
create index if not exists events_ts_idx          on events (ts desc);

-- Defense in depth: the backend uses the service role (bypasses RLS). No anon
-- policies — direct client reads/writes are denied; all access goes through the API.
alter table events enable row level security;
