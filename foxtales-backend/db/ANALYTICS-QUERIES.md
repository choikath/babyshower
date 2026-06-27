# Recording-flow analytics — runbook & queries

Backs the "record your own way" funnel + drop-off analysis. One append-only table
(`events`) is written server-side via `POST /api/events`; the admin dashboard reads
a pre-computed funnel from `GET /api/analytics/funnel`.

## Apply the migration

Run against the **backend's** Postgres (the Supabase DB the Fly service uses), via
`psql "$DATABASE_URL" -f db/0005_events.sql` **or** paste it into the Supabase SQL
Editor. Idempotent.

```sql
-- contents of db/0005_events.sql — creates table `events` + indexes + enables RLS
```

Also set a real **`ANALYTICS_SALT`** secret on Fly (used to HMAC IPs into `ip_hash`):
`fly secrets set ANALYTICS_SALT="$(openssl rand -hex 32)" -a foxtales-backend`.

## The event stream

Each row = one event: `event`, `ts` (server), `client_ts`, `session_id` (one sitting),
`device_id` (persistent, unique-user proxy), `user_id` (usually null on the public
recorder), `family_id`, `flow` (`record_own`), `step`, `props` (jsonb), `ua`,
`ip_hash` (pseudonymous), `source` (`client` | `server`).

## Funnel (matches the admin dashboard)

Distinct **sessions** (and **devices**) reaching each stage in the last N hours:

```sql
with f as (
  select session_id, max(device_id) as device_id,
    bool_or(event='app_opened')                                          as s_opened,
    bool_or(event='flow_started')                                        as s_started,
    bool_or(event='step_viewed'     and step='intro')                    as s_intro,
    bool_or(event='mode_selected'   and props->>'mode'='free')           as s_mode_free,
    bool_or(event='record_started'  and props->>'slot'='story')          as s_recorded,
    bool_or(event='recording_submitted')                                 as s_submitted,
    bool_or(event='upload_succeeded')                                    as s_uploaded,
    bool_or(event='success_viewed')                                      as s_success
  from events
  where flow='record_own' and session_id is not null
    and ts > now() - interval '7 days'
  group by session_id
)
select
  count(*) filter (where s_opened)     as opened,
  count(*) filter (where s_started)    as started,
  count(*) filter (where s_intro)      as reached_intro,
  count(*) filter (where s_mode_free)  as chose_record_own,
  count(*) filter (where s_recorded)   as recorded_a_part,
  count(*) filter (where s_submitted)  as tapped_finish,
  count(*) filter (where s_uploaded)   as upload_ok,
  count(*) filter (where s_success)    as saw_success,
  count(distinct device_id)            as unique_devices,
  count(*)                             as total_sessions
from f;
```

The biggest drop is typically **chose_record_own → recorded_a_part** (the core
recording step) and **mic permission** — check `mic_permission_denied` volume.

### Server-truth tail (beacon-loss-proof)
Client beacons can be lost on tab close. The backend also emits `story_created`,
`story_stitched`, `card_minted`, `card_linked` (`source='server'`). Cross-check the
client `upload_succeeded` count against server `story_stitched`:

```sql
select source, count(*) filter (where event in ('upload_succeeded','story_stitched'))
from events where flow='record_own' and ts > now() - interval '7 days' group by source;
```

## Unique users (approximate)

```sql
select count(distinct device_id) as unique_devices,
       count(distinct session_id) as sessions
from events where flow='record_own' and ts > now() - interval '30 days';
```
Caveat: `device_id` is a localStorage uuid — incognito / cleared storage / shared
devices make this an approximation. `ip_hash` is a coarse fallback bound.

## Median time on each step

```sql
with steps as (
  select session_id, step, min(ts) as entered
  from events where event='step_viewed' and flow='record_own' group by session_id, step
)
select step,
  percentile_cont(0.5) within group (order by extract(epoch from (next_entered - entered))) as median_sec
from (
  select session_id, step, entered,
         lead(entered) over (partition by session_id order by entered) as next_entered
  from steps
) x where next_entered is not null group by step order by median_sec desc;
```

## Why people drop at the recording step

```sql
select event, count(*) from events
where flow='record_own' and event in
  ('mic_permission_denied','record_error','take_deleted','part_deleted','preview_played','upload_failed')
  and ts > now() - interval '7 days'
group by event order by count desc;
```

## Optional convenience view

```sql
create or replace view record_funnel_7d as
with f as (
  select session_id, max(device_id) as device_id,
    bool_or(event='app_opened') s_opened, bool_or(event='flow_started') s_started,
    bool_or(event='step_viewed' and step='intro') s_intro,
    bool_or(event='mode_selected' and props->>'mode'='free') s_mode_free,
    bool_or(event='record_started' and props->>'slot'='story') s_recorded,
    bool_or(event='recording_submitted') s_submitted,
    bool_or(event='upload_succeeded') s_uploaded, bool_or(event='success_viewed') s_success
  from events where flow='record_own' and session_id is not null and ts > now() - interval '7 days'
  group by session_id)
select count(*) filter (where s_opened) opened, count(*) filter (where s_started) started,
       count(*) filter (where s_intro) reached_intro, count(*) filter (where s_mode_free) chose_record_own,
       count(*) filter (where s_recorded) recorded_a_part, count(*) filter (where s_submitted) tapped_finish,
       count(*) filter (where s_uploaded) upload_ok, count(*) filter (where s_success) saw_success,
       count(distinct device_id) unique_devices, count(*) total_sessions
from f;
```
