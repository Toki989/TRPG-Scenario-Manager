-- Release UI support for drafts, user settings, and optional scenario fields.
-- This migration is intentionally checked in only; apply it to Supabase after review.

alter table public.scenarios
  alter column system drop not null;

alter table public.scenarios
  drop constraint if exists scenarios_player_count_values_check,
  drop constraint if exists scenarios_play_time_values_check;

alter table public.scenarios
  add constraint scenarios_player_count_values_check
  check (
    (player_count_type = 'fixed'
      and (player_count_fixed is null or player_count_fixed > 0)
      and player_count_min is null
      and player_count_max is null
      and player_count_text is null)
    or
    (player_count_type = 'range'
      and (
        (player_count_min is null and player_count_max is null)
        or
        (player_count_min is not null and player_count_min > 0
          and player_count_max is not null
          and player_count_max >= player_count_min)
      )
      and player_count_fixed is null
      and player_count_text is null)
    or
    (player_count_type = 'free'
      and player_count_fixed is null
      and player_count_min is null
      and player_count_max is null)
  );

alter table public.scenarios
  add constraint scenarios_play_time_values_check
  check (
    (play_time_type = 'fixed'
      and (play_time_fixed is null or play_time_fixed >= 0)
      and play_time_min is null
      and play_time_max is null
      and play_time_text is null)
    or
    (play_time_type = 'range'
      and (
        (play_time_min is null and play_time_max is null)
        or
        (play_time_min is not null and play_time_min >= 0
          and play_time_max is not null
          and play_time_max >= play_time_min)
      )
      and play_time_fixed is null
      and play_time_text is null)
    or
    (play_time_type = 'free'
      and play_time_fixed is null
      and play_time_min is null
      and play_time_max is null)
  );

drop function if exists public.create_scenario(uuid, text, text, text, text, smallint, smallint);

create or replace function public.create_scenario(
  p_owner_id uuid,
  p_title text,
  p_system text,
  p_scenario_type text,
  p_author text,
  p_player_count_type text,
  p_player_count_fixed smallint,
  p_player_count_min smallint,
  p_player_count_max smallint,
  p_player_count_text text,
  p_play_time_type text,
  p_play_time_fixed smallint,
  p_play_time_min smallint,
  p_play_time_max smallint,
  p_play_time_text text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scenario_id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_owner_id then
    raise exception 'scenario owner must match authenticated user'
      using errcode = '42501';
  end if;

  insert into public.scenarios (
    owner_id, title, system, scenario_type, author,
    player_count_type, player_count_fixed, player_count_min,
    player_count_max, player_count_text,
    play_time_type, play_time_fixed, play_time_min,
    play_time_max, play_time_text
  ) values (
    p_owner_id,
    nullif(btrim(p_title), ''),
    nullif(btrim(p_system), ''),
    p_scenario_type,
    nullif(btrim(p_author), ''),
    p_player_count_type,
    p_player_count_fixed,
    p_player_count_min,
    p_player_count_max,
    nullif(btrim(p_player_count_text), ''),
    p_play_time_type,
    p_play_time_fixed,
    p_play_time_min,
    p_play_time_max,
    nullif(btrim(p_play_time_text), '')
  )
  returning id into v_scenario_id;

  return v_scenario_id;
end;
$$;

revoke all on function public.create_scenario(
  uuid, text, text, text, text, text, smallint, smallint, smallint,
  text, text, smallint, smallint, smallint, text
) from public;
grant execute on function public.create_scenario(
  uuid, text, text, text, text, text, smallint, smallint, smallint,
  text, text, smallint, smallint, smallint, text
) to authenticated;

create table if not exists public.scenario_drafts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  scenario_id uuid references public.scenarios (id) on delete cascade,
  title text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scenario_drafts_owner_updated_idx
  on public.scenario_drafts (owner_id, updated_at desc);

create table if not exists public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  theme text not null default 'light',
  list_columns smallint not null default 4,
  delete_confirm boolean not null default true,
  backup_after_save boolean not null default false,
  discord_format jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_settings_theme_check check (theme in ('light', 'middle', 'dark')),
  constraint user_settings_list_columns_check check (list_columns in (1, 2, 3, 4))
);

alter table public.scenario_drafts enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists scenario_drafts_select_own on public.scenario_drafts;
create policy scenario_drafts_select_own
  on public.scenario_drafts for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists scenario_drafts_insert_own on public.scenario_drafts;
create policy scenario_drafts_insert_own
  on public.scenario_drafts for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists scenario_drafts_update_own on public.scenario_drafts;
create policy scenario_drafts_update_own
  on public.scenario_drafts for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists scenario_drafts_delete_own on public.scenario_drafts;
create policy scenario_drafts_delete_own
  on public.scenario_drafts for delete to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists user_settings_select_own on public.user_settings;
create policy user_settings_select_own
  on public.user_settings for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists user_settings_insert_own on public.user_settings;
create policy user_settings_insert_own
  on public.user_settings for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists user_settings_update_own on public.user_settings;
create policy user_settings_update_own
  on public.user_settings for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop trigger if exists scenario_drafts_set_updated_at on public.scenario_drafts;
create trigger scenario_drafts_set_updated_at
before update on public.scenario_drafts
for each row execute function public.set_updated_at();

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
before update on public.user_settings
for each row execute function public.set_updated_at();
