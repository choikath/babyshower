-- ─────────────────────────────────────────────────────────────────────────────
-- FoxTales — audio branding bucket + policies  (run ONCE in the Supabase SQL editor)
-- ─────────────────────────────────────────────────────────────────────────────
-- Creates a PUBLIC Storage bucket called `branding` that holds the three shared
-- clips the recorder stitches into every story:
--
--     jingle.mp3   →  intro jingle (plays first, fades out under the greeting)
--     intro.mp3    →  branded intro (plays after the personal greeting)
--     outro.mp3    →  branded outro (fades in under the end of the story)
--
-- READ is public so any (signed-out) recorder's browser can fetch them at stitch
-- time. WRITE / REPLACE / DELETE is locked to the admin email below by RLS, so
-- nobody else can change what every story plays — even though the page only
-- *shows* the upload UI to that user.
--
-- The admin email here MUST match ADMIN_EMAILS in index.html.
-- To use a different admin, change every 'choikath@gmail.com' below to match.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) The bucket (public read). Re-running is safe; it just re-asserts public=true.
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do update set public = true;

-- 2) Row-Level-Security policies on the objects in this bucket.
--    (storage.objects already has RLS enabled in a standard Supabase project.)

-- Anyone may READ the listing/rows for this bucket (the files are public anyway;
-- this lets the admin page list which slots are populated, and is harmless).
drop policy if exists "branding public read" on storage.objects;
create policy "branding public read"
  on storage.objects for select
  to public
  using ( bucket_id = 'branding' );

-- Only the admin email may ADD a file.
drop policy if exists "branding admin insert" on storage.objects;
create policy "branding admin insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'branding'
    and lower(auth.jwt() ->> 'email') = 'choikath@gmail.com'
  );

-- Only the admin email may REPLACE a file (upsert = update).
drop policy if exists "branding admin update" on storage.objects;
create policy "branding admin update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'branding'
    and lower(auth.jwt() ->> 'email') = 'choikath@gmail.com'
  )
  with check (
    bucket_id = 'branding'
    and lower(auth.jwt() ->> 'email') = 'choikath@gmail.com'
  );

-- Only the admin email may REMOVE a file.
drop policy if exists "branding admin delete" on storage.objects;
create policy "branding admin delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'branding'
    and lower(auth.jwt() ->> 'email') = 'choikath@gmail.com'
  );

-- Done. Sign in at https://foxtales.app/admin as the admin email, then use the
-- "Intro & outro audio" card to upload the jingle / intro / outro.
