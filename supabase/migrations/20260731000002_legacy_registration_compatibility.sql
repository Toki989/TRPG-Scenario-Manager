-- Preserve the old application's registration values without coercing them
-- into the React editor's normalized representations.
alter table public.scenarios
  add column if not exists title_reading text,
  add column if not exists author_reading text,
  add column if not exists legacy_registration jsonb not null default '{}'::jsonb;

alter table public.user_scenario_data
  add column if not exists kp_memo text,
  add column if not exists pl_memo text;

alter table public.scenario_episodes
  add column if not exists legacy_time_text text;

alter table public.scenario_images
  add column if not exists position_x numeric not null default 50,
  add column if not exists position_y numeric not null default 50,
  add column if not exists zoom numeric not null default 1;

alter table public.scenario_images
  drop constraint if exists scenario_images_position_x_check,
  drop constraint if exists scenario_images_position_y_check,
  drop constraint if exists scenario_images_zoom_check;

alter table public.scenario_images
  add constraint scenario_images_position_x_check check (position_x >= 0 and position_x <= 100),
  add constraint scenario_images_position_y_check check (position_y >= 0 and position_y <= 100),
  add constraint scenario_images_zoom_check check (zoom >= 1 and zoom <= 3);
