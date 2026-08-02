-- Create a checked RPC for scenario creation.
-- RLS remains enabled. The function explicitly requires the caller's
-- authenticated user id to match the scenario owner id.
create or replace function public.create_scenario(
  p_owner_id uuid,
  p_title text,
  p_system text,
  p_scenario_type text,
  p_author text,
  p_player_count_fixed smallint,
  p_play_time_fixed smallint
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
    owner_id,
    title,
    system,
    scenario_type,
    author,
    player_count_type,
    player_count_fixed,
    player_count_min,
    player_count_max,
    player_count_text,
    play_time_type,
    play_time_fixed,
    play_time_min,
    play_time_max,
    play_time_text
  ) values (
    p_owner_id,
    p_title,
    p_system,
    p_scenario_type,
    nullif(btrim(p_author), ''),
    'fixed',
    p_player_count_fixed,
    null,
    null,
    null,
    'fixed',
    p_play_time_fixed,
    null,
    null,
    null
  )
  returning id into v_scenario_id;

  return v_scenario_id;
end;
$$;

revoke all on function public.create_scenario(uuid, text, text, text, text, smallint, smallint) from public;
grant execute on function public.create_scenario(uuid, text, text, text, text, smallint, smallint) to authenticated;
