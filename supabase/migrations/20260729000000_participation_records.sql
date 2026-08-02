create table if not exists public.scenario_sessions (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios (id) on delete cascade,
  display_order smallint not null,
  name text,
  role text not null default 'PL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scenario_sessions_display_order_positive check (display_order > 0),
  constraint scenario_sessions_role_check check (role in ('KP', 'PL')),
  constraint scenario_sessions_scenario_order_key unique (scenario_id, display_order)
);

create table if not exists public.scenario_session_characters (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.scenario_sessions (id) on delete cascade,
  display_order smallint not null,
  name text,
  player_name text,
  iachara_url text,
  ho text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scenario_session_characters_display_order_positive check (display_order > 0),
  constraint scenario_session_characters_session_order_key unique (session_id, display_order)
);

alter table public.scenario_sessions enable row level security;
alter table public.scenario_session_characters enable row level security;

create policy scenario_sessions_select_owner_or_shared
  on public.scenario_sessions
  for select
  to authenticated
  using ((select private.can_view_scenario(scenario_id, (select auth.uid()))));

create policy scenario_sessions_insert_owner
  on public.scenario_sessions
  for insert
  to authenticated
  with check ((select private.is_scenario_owner(scenario_id, (select auth.uid()))));

create policy scenario_sessions_update_owner
  on public.scenario_sessions
  for update
  to authenticated
  using ((select private.is_scenario_owner(scenario_id, (select auth.uid()))))
  with check ((select private.is_scenario_owner(scenario_id, (select auth.uid()))));

create policy scenario_sessions_delete_owner
  on public.scenario_sessions
  for delete
  to authenticated
  using ((select private.is_scenario_owner(scenario_id, (select auth.uid()))));

create policy scenario_session_characters_select_owner_or_shared
  on public.scenario_session_characters
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.scenario_sessions as ss
      where ss.id = session_id
        and (select private.can_view_scenario(ss.scenario_id, (select auth.uid())))
    )
  );

create policy scenario_session_characters_insert_owner
  on public.scenario_session_characters
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.scenario_sessions as ss
      where ss.id = session_id
        and (select private.is_scenario_owner(ss.scenario_id, (select auth.uid())))
    )
  );

create policy scenario_session_characters_update_owner
  on public.scenario_session_characters
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.scenario_sessions as ss
      where ss.id = session_id
        and (select private.is_scenario_owner(ss.scenario_id, (select auth.uid())))
    )
  )
  with check (
    exists (
      select 1
      from public.scenario_sessions as ss
      where ss.id = session_id
        and (select private.is_scenario_owner(ss.scenario_id, (select auth.uid())))
    )
  );

create policy scenario_session_characters_delete_owner
  on public.scenario_session_characters
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.scenario_sessions as ss
      where ss.id = session_id
        and (select private.is_scenario_owner(ss.scenario_id, (select auth.uid())))
    )
  );

create trigger scenario_sessions_set_updated_at
before update on public.scenario_sessions
for each row execute function public.set_updated_at();

create trigger scenario_session_characters_set_updated_at
before update on public.scenario_session_characters
for each row execute function public.set_updated_at();
