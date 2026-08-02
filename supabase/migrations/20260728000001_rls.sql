-- TRPG Scenario Manager
-- Row Level Security and authorization helpers.
-- Storage object policies are maintained separately because they depend on
-- bucket configuration and object path conventions.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_scenario_owner(
  p_scenario_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.scenarios as s
    where s.id = p_scenario_id
      and s.owner_id = p_user_id
  );
$$;

create or replace function private.can_view_scenario(
  p_scenario_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.scenarios as s
    where s.id = p_scenario_id
      and s.owner_id = p_user_id
  )
  or exists (
    select 1
    from public.scenario_shares as ss
    where ss.scenario_id = p_scenario_id
      and ss.shared_user_id = p_user_id
      and ss.permission = 'viewer'
  );
$$;

revoke all on function private.is_scenario_owner(uuid, uuid) from public;
revoke all on function private.can_view_scenario(uuid, uuid) from public;
grant execute on function private.is_scenario_owner(uuid, uuid) to authenticated;
grant execute on function private.can_view_scenario(uuid, uuid) to authenticated;

-- Exact-match lookup only. The function intentionally exposes no email,
-- avatar path, or other profile fields.
create or replace function public.find_profile_by_share_code(
  p_share_code text
)
returns table (
  id uuid,
  display_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name
  from public.profiles as p
  where p.share_code = upper(btrim(p_share_code));
$$;

revoke all on function public.find_profile_by_share_code(text) from public;
grant execute on function public.find_profile_by_share_code(text) to authenticated;

alter table public.profiles enable row level security;
alter table public.scenarios enable row level security;
alter table public.scenario_episodes enable row level security;
alter table public.scenario_images enable row level security;
alter table public.scenario_handouts enable row level security;
alter table public.user_scenario_data enable row level security;
alter table public.scenario_shares enable row level security;

-- profiles: only the authenticated user can access their own profile.
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check (id = (select auth.uid()));

create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- There is intentionally no DELETE policy for profiles. Account deletion is
-- performed by the server-side withdrawal workflow.

-- scenarios: owners have full CRUD; shared users have read-only access.
create policy scenarios_select_owner_or_shared
  on public.scenarios
  for select
  to authenticated
  using ((select private.can_view_scenario(id, (select auth.uid()))));

create policy scenarios_insert_owner
  on public.scenarios
  for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy scenarios_update_owner
  on public.scenarios
  for update
  to authenticated
  using ((select private.is_scenario_owner(id, (select auth.uid()))))
  with check (owner_id = (select auth.uid()));

create policy scenarios_delete_owner
  on public.scenarios
  for delete
  to authenticated
  using ((select private.is_scenario_owner(id, (select auth.uid()))));

-- Campaign episodes follow the visibility and edit permissions of the parent.
create policy scenario_episodes_select_owner_or_shared
  on public.scenario_episodes
  for select
  to authenticated
  using ((select private.can_view_scenario(scenario_id, (select auth.uid()))));

create policy scenario_episodes_insert_owner
  on public.scenario_episodes
  for insert
  to authenticated
  with check ((select private.is_scenario_owner(scenario_id, (select auth.uid()))));

create policy scenario_episodes_update_owner
  on public.scenario_episodes
  for update
  to authenticated
  using ((select private.is_scenario_owner(scenario_id, (select auth.uid()))))
  with check ((select private.is_scenario_owner(scenario_id, (select auth.uid()))));

create policy scenario_episodes_delete_owner
  on public.scenario_episodes
  for delete
  to authenticated
  using ((select private.is_scenario_owner(scenario_id, (select auth.uid()))));

-- Child scenario data follows the visibility of its parent scenario.
create policy scenario_images_select_owner_or_shared
  on public.scenario_images
  for select
  to authenticated
  using ((select private.can_view_scenario(scenario_id, (select auth.uid()))));

create policy scenario_images_insert_owner
  on public.scenario_images
  for insert
  to authenticated
  with check ((select private.is_scenario_owner(scenario_id, (select auth.uid()))));

create policy scenario_images_update_owner
  on public.scenario_images
  for update
  to authenticated
  using ((select private.is_scenario_owner(scenario_id, (select auth.uid()))))
  with check ((select private.is_scenario_owner(scenario_id, (select auth.uid()))));

create policy scenario_images_delete_owner
  on public.scenario_images
  for delete
  to authenticated
  using ((select private.is_scenario_owner(scenario_id, (select auth.uid()))));

create policy scenario_handouts_select_owner_or_shared
  on public.scenario_handouts
  for select
  to authenticated
  using ((select private.can_view_scenario(scenario_id, (select auth.uid()))));

create policy scenario_handouts_insert_owner
  on public.scenario_handouts
  for insert
  to authenticated
  with check ((select private.is_scenario_owner(scenario_id, (select auth.uid()))));

create policy scenario_handouts_update_owner
  on public.scenario_handouts
  for update
  to authenticated
  using ((select private.is_scenario_owner(scenario_id, (select auth.uid()))))
  with check ((select private.is_scenario_owner(scenario_id, (select auth.uid()))));

create policy scenario_handouts_delete_owner
  on public.scenario_handouts
  for delete
  to authenticated
  using ((select private.is_scenario_owner(scenario_id, (select auth.uid()))));

-- Personal data is always scoped to the row owner. INSERT additionally
-- requires access to the referenced scenario.
create policy user_scenario_data_select_own
  on public.user_scenario_data
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy user_scenario_data_insert_own_accessible
  on public.user_scenario_data
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and (select private.can_view_scenario(scenario_id, (select auth.uid())))
  );

create policy user_scenario_data_update_own
  on public.user_scenario_data
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy user_scenario_data_delete_own
  on public.user_scenario_data
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- Sharing records are visible to the owner of the scenario and to the
-- recipient of that specific share. Only owners can manage them.
create policy scenario_shares_select_owner_or_recipient
  on public.scenario_shares
  for select
  to authenticated
  using (
    (select private.is_scenario_owner(scenario_id, (select auth.uid())))
    or shared_user_id = (select auth.uid())
  );

create policy scenario_shares_insert_owner
  on public.scenario_shares
  for insert
  to authenticated
  with check (
    (select private.is_scenario_owner(scenario_id, (select auth.uid())))
    and shared_user_id <> (select auth.uid())
    and permission = 'viewer'
  );

create policy scenario_shares_update_owner
  on public.scenario_shares
  for update
  to authenticated
  using ((select private.is_scenario_owner(scenario_id, (select auth.uid()))))
  with check (
    (select private.is_scenario_owner(scenario_id, (select auth.uid())))
    and shared_user_id <> (select auth.uid())
    and permission = 'viewer'
  );

create policy scenario_shares_delete_owner
  on public.scenario_shares
  for delete
  to authenticated
  using ((select private.is_scenario_owner(scenario_id, (select auth.uid()))));

-- user_scenario_data identity is immutable. RLS can restrict the new values,
-- but a trigger is required to compare OLD and NEW values.
create or replace function private.prevent_user_scenario_identity_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.scenario_id is distinct from old.scenario_id then
    raise exception 'user_scenario_data identity cannot be changed';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_user_scenario_identity_change() from public;

create trigger user_scenario_data_identity_immutable
before update on public.user_scenario_data
for each row execute function private.prevent_user_scenario_identity_change();
