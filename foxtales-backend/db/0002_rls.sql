-- Row Level Security (spec 2.6). The Node service connects with the Supabase
-- SERVICE ROLE key, which bypasses RLS, and does its own auth + role checks.
-- These policies therefore protect *direct* client access to the database
-- (e.g. if the iOS app ever queries Postgres via the anon key) — defense in depth.

-- Security-definer helpers avoid recursive policy evaluation on memberships.
create or replace function public.is_member(fam uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from memberships m where m.family_id = fam and m.user_id = auth.uid());
$$;

create or replace function public.is_owner(fam uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from memberships m where m.family_id = fam and m.user_id = auth.uid() and m.role = 'owner');
$$;

alter table families   enable row level security;
alter table users       enable row level security;
alter table memberships enable row level security;
alter table stories     enable row level security;
alter table cards       enable row level security;
alter table invites     enable row level security;

-- families: members can see; owners can rename. Bootstrap insert happens via service role.
drop policy if exists families_select on families;
create policy families_select on families for select using (public.is_member(id));
drop policy if exists families_update on families;
create policy families_update on families for update using (public.is_owner(id));

-- users: see yourself and people you share a family with; edit only yourself.
drop policy if exists users_select on users;
create policy users_select on users for select using (
  id = auth.uid()
  or exists (
    select 1 from memberships m1
    join memberships m2 on m1.family_id = m2.family_id
    where m1.user_id = auth.uid() and m2.user_id = users.id
  )
);
drop policy if exists users_update on users;
create policy users_update on users for update using (id = auth.uid());

-- memberships: visible to members; managed by owners.
drop policy if exists memberships_select on memberships;
create policy memberships_select on memberships for select using (public.is_member(family_id));
drop policy if exists memberships_write on memberships;
create policy memberships_write on memberships for all using (public.is_owner(family_id)) with check (public.is_owner(family_id));

-- stories: members read and add; owners can delete (hard-delete on request, spec 2.6).
drop policy if exists stories_select on stories;
create policy stories_select on stories for select using (public.is_member(family_id));
drop policy if exists stories_insert on stories;
create policy stories_insert on stories for insert with check (public.is_member(family_id));
drop policy if exists stories_update on stories;
create policy stories_update on stories for update using (public.is_member(family_id));
drop policy if exists stories_delete on stories;
create policy stories_delete on stories for delete using (public.is_owner(family_id));

-- cards: members read; owners manage (mint/link/lock/revoke).
drop policy if exists cards_select on cards;
create policy cards_select on cards for select using (public.is_member(family_id));
drop policy if exists cards_write on cards;
create policy cards_write on cards for all using (public.is_owner(family_id)) with check (public.is_owner(family_id));

-- invites: owners only.
drop policy if exists invites_all on invites;
create policy invites_all on invites for all using (public.is_owner(family_id)) with check (public.is_owner(family_id));
