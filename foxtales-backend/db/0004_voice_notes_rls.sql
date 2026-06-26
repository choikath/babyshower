-- Row Level Security for voice_notes (companion to 0002_rls.sql).
-- The Node service connects with the SERVICE ROLE key (bypasses RLS) and does its
-- own auth/role checks, exactly like stories/cards. These policies are defense in
-- depth for any *direct* client (anon-key) access.
--
-- Note: memos are CREATED by anonymous listeners through the backend (service role),
-- so there is intentionally no anon insert policy here — inserts only happen
-- server-side. Family members (and the admin email, server-side) read them.

alter table voice_notes enable row level security;

-- Members of the owning family can read their inbox.
drop policy if exists voice_notes_select on voice_notes;
create policy voice_notes_select on voice_notes
  for select using (public.is_member(family_id));

-- Owners can delete a memo (parity with stories_delete).
drop policy if exists voice_notes_delete on voice_notes;
create policy voice_notes_delete on voice_notes
  for delete using (public.is_owner(family_id));
