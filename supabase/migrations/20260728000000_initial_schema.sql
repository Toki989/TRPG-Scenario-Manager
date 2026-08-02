-- TRPG Scenario Manager
-- Initial relational schema (DDL only).
-- RLS, Storage policies, auth profile provisioning, and account deletion
-- workflows are intentionally maintained as separate migrations.

create extension if not exists pgcrypto;

create or replace function public.normalize_share_code()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.share_code = upper(btrim(new.share_code));
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  share_code text not null,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_not_blank
    check (length(btrim(replace(display_name, '　', ' '))) > 0),
  constraint profiles_share_code_format
    check (share_code ~ '^TRPG-[A-HJ-NP-Z2-9]{6}$'),
  constraint profiles_avatar_path_not_blank
    check (
      avatar_path is null
      or length(btrim(replace(avatar_path, '　', ' '))) > 0
    ),
  constraint profiles_share_code_key unique (share_code)
);

create trigger profiles_normalize_share_code
before insert or update of share_code on public.profiles
for each row execute function public.normalize_share_code();

create table public.scenarios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  title text not null,
  system text not null,
  scenario_type text not null default 'normal',
  edition text,
  author text,
  stage text,
  player_count_type text not null,
  player_count_fixed smallint,
  player_count_min smallint,
  player_count_max smallint,
  player_count_text text,
  play_time_type text not null,
  play_time_fixed smallint,
  play_time_min smallint,
  play_time_max smallint,
  play_time_text text,
  recommended_skills text,
  secondary_skills text,
  not_recommended text,
  lost_rate text,
  lost_rate_note text,
  ho_type text,
  scenario_tags text[] not null default '{}'::text[],
  battle text,
  cautions text,
  trailer_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scenarios_title_not_blank
    check (length(btrim(replace(title, '　', ' '))) > 0),
  constraint scenarios_system_not_blank
    check (length(btrim(replace(system, '　', ' '))) > 0),
  constraint scenarios_scenario_type_check
    check (scenario_type in ('normal', 'campaign', 'kp_less')),
  constraint scenarios_player_count_type_check
    check (player_count_type in ('fixed', 'range', 'free')),
  constraint scenarios_player_count_values_check
    check (
      (player_count_type = 'fixed'
        and player_count_fixed is not null
        and player_count_fixed > 0
        and player_count_min is null
        and player_count_max is null
        and player_count_text is null)
      or
      (player_count_type = 'range'
        and player_count_fixed is null
        and player_count_min is not null
        and player_count_min > 0
        and player_count_max is not null
        and player_count_max >= player_count_min
        and player_count_text is null)
      or
      (player_count_type = 'free'
        and player_count_fixed is null
        and player_count_min is null
        and player_count_max is null
        and player_count_text is not null
        and btrim(player_count_text) <> '')
    ),
  constraint scenarios_play_time_type_check
    check (play_time_type in ('fixed', 'range', 'free')),
  constraint scenarios_play_time_values_check
    check (
      (play_time_type = 'fixed'
        and play_time_fixed is not null
        and play_time_fixed > 0
        and play_time_min is null
        and play_time_max is null
        and play_time_text is null)
      or
      (play_time_type = 'range'
        and play_time_fixed is null
        and play_time_min is not null
        and play_time_min > 0
        and play_time_max is not null
        and play_time_max >= play_time_min
        and play_time_text is null)
      or
      (play_time_type = 'free'
        and play_time_fixed is null
        and play_time_min is null
        and play_time_max is null
        and play_time_text is not null
        and btrim(play_time_text) <> '')
    ),
  constraint scenarios_lost_rate_check
    check (lost_rate is null or lost_rate in (
      'none', 'low', 'medium', 'high', 'very_high', 'unknown'
    )),
  constraint scenarios_ho_type_check
    check (ho_type is null or ho_type in (
      'none', 'common', 'individual', 'common_individual', 'special'
    )),
  constraint scenarios_battle_check
    check (battle is null or battle in ('yes', 'no', 'conditional'))
);

create table public.scenario_episodes (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios (id) on delete cascade,
  episode_number smallint not null,
  title text,
  time_type text not null,
  time_fixed smallint,
  time_min smallint,
  time_max smallint,
  time_text text,
  summary text,
  status text not null default 'not_started',
  play_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scenario_episodes_number_positive
    check (episode_number > 0),
  constraint scenario_episodes_time_type_check
    check (time_type in ('fixed', 'range', 'free')),
  constraint scenario_episodes_time_values_check
    check (
      (time_type = 'fixed'
        and time_fixed is not null
        and time_fixed > 0
        and time_min is null
        and time_max is null
        and time_text is null)
      or
      (time_type = 'range'
        and time_fixed is null
        and time_min is not null
        and time_min > 0
        and time_max is not null
        and time_max >= time_min
        and time_text is null)
      or
      (time_type = 'free'
        and time_fixed is null
        and time_min is null
        and time_max is null
        and time_text is not null
        and btrim(time_text) <> '')
    ),
  constraint scenario_episodes_status_check
    check (status in ('not_started', 'completed')),
  constraint scenario_episodes_scenario_number_key
    unique (scenario_id, episode_number)
);

create table public.scenario_images (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios (id) on delete cascade,
  storage_path text not null,
  display_order smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scenario_images_storage_path_not_blank
    check (length(btrim(replace(storage_path, '　', ' '))) > 0),
  constraint scenario_images_display_order_positive
    check (display_order > 0),
  constraint scenario_images_scenario_order_key
    unique (scenario_id, display_order)
);

create table public.scenario_handouts (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios (id) on delete cascade,
  display_order smallint not null,
  label text,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scenario_handouts_display_order_positive
    check (display_order > 0),
  constraint scenario_handouts_content_not_blank
    check (length(btrim(replace(content, '　', ' '))) > 0),
  constraint scenario_handouts_scenario_order_key
    unique (scenario_id, display_order)
);

create table public.user_scenario_data (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  scenario_id uuid not null references public.scenarios (id) on delete cascade,
  favorite boolean not null default false,
  kp_status text not null default 'not_started',
  play_status text not null default 'not_started',
  purchase_url text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_scenario_data_kp_status_check
    check (kp_status in ('not_started', 'completed')),
  constraint user_scenario_data_play_status_check
    check (play_status in ('not_started', 'completed')),
  constraint user_scenario_data_purchase_url_not_blank
    check (
      purchase_url is null
      or length(btrim(replace(purchase_url, '　', ' '))) > 0
    ),
  constraint user_scenario_data_user_scenario_key
    unique (user_id, scenario_id)
);

create table public.scenario_shares (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios (id) on delete cascade,
  shared_user_id uuid not null references public.profiles (id) on delete cascade,
  permission text not null default 'viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scenario_shares_permission_check
    check (permission = 'viewer'),
  constraint scenario_shares_scenario_user_key
    unique (scenario_id, shared_user_id)
);

-- The composite unique indexes already support scenario_id-first lookups on
-- images, handouts, and shares. These indexes cover the reverse lookups used
-- for a user's personal data and received shares.
create index idx_user_scenario_data_scenario
  on public.user_scenario_data (scenario_id);

create index idx_scenario_shares_shared_user
  on public.scenario_shares (shared_user_id);

create index idx_scenarios_owner_updated_at
  on public.scenarios (owner_id, updated_at desc);

create index idx_scenarios_system
  on public.scenarios (system);

create index idx_scenarios_edition
  on public.scenarios (edition);

create index idx_scenarios_tags
  on public.scenarios using gin (scenario_tags);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger scenarios_set_updated_at
before update on public.scenarios
for each row execute function public.set_updated_at();

create trigger scenario_episodes_set_updated_at
before update on public.scenario_episodes
for each row execute function public.set_updated_at();

create trigger scenario_images_set_updated_at
before update on public.scenario_images
for each row execute function public.set_updated_at();

create trigger scenario_handouts_set_updated_at
before update on public.scenario_handouts
for each row execute function public.set_updated_at();

create trigger user_scenario_data_set_updated_at
before update on public.user_scenario_data
for each row execute function public.set_updated_at();

create trigger scenario_shares_set_updated_at
before update on public.scenario_shares
for each row execute function public.set_updated_at();

-- Prevent an owner from sharing a scenario with their own profile. RLS will
-- independently restrict inserts to scenario owners; this trigger protects
-- the invariant at the table level as well.
create or replace function public.prevent_self_scenario_share()
returns trigger
language plpgsql
as $$
declare
  scenario_owner uuid;
begin
  select owner_id into scenario_owner
  from public.scenarios
  where id = new.scenario_id;

  if scenario_owner is null then
    raise exception 'scenario does not exist';
  end if;

  if scenario_owner = new.shared_user_id then
    raise exception 'a scenario cannot be shared with its owner';
  end if;

  return new;
end;
$$;

create trigger scenario_shares_prevent_self_share
before insert or update on public.scenario_shares
for each row execute function public.prevent_self_scenario_share();
