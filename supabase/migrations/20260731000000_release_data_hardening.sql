-- Release data hardening for the formally adopted UI decisions.
-- This migration removes the deleted edition field, normalizes the three
-- theme values, and makes draft ownership/versioning explicit.

drop index if exists public.idx_scenarios_edition;
alter table public.scenarios
  drop column if exists edition;

alter table public.user_settings
  drop constraint if exists user_settings_theme_check;

update public.user_settings
set theme = 'gray'
where theme = 'middle';

alter table public.user_settings
  add constraint user_settings_theme_check
  check (theme in ('light', 'gray', 'dark'));

update public.scenario_drafts
set payload = jsonb_set(payload, '{schemaVersion}', '1'::jsonb, true)
where not (payload ? 'schemaVersion');

alter table public.scenario_drafts
  drop constraint if exists scenario_drafts_payload_object_check,
  drop constraint if exists scenario_drafts_payload_version_check;

alter table public.scenario_drafts
  add constraint scenario_drafts_payload_object_check
  check (jsonb_typeof(payload) = 'object'),
  add constraint scenario_drafts_payload_version_check
  check (payload->>'schemaVersion' = '1');

create or replace function private.validate_scenario_draft_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.scenario_id is not null
     and not exists (
       select 1
       from public.scenarios as s
       where s.id = new.scenario_id
         and s.owner_id = new.owner_id
     ) then
    raise exception 'draft scenario must belong to draft owner'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_scenario_draft_owner() from public;

drop trigger if exists scenario_drafts_validate_owner
  on public.scenario_drafts;

create trigger scenario_drafts_validate_owner
before insert or update of owner_id, scenario_id on public.scenario_drafts
for each row execute function private.validate_scenario_draft_owner();

-- Save the relational portion of a scenario editor as one database transaction.
-- Storage binaries remain outside the transaction and are compensated by the
-- frontend service when the relational operation fails.
create or replace function public.save_scenario_aggregate(
  p_scenario_id uuid,
  p_scenario jsonb,
  p_user_data jsonb,
  p_handouts jsonb,
  p_episodes jsonb,
  p_sessions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_scenario_id uuid := p_scenario_id;
  v_item jsonb;
  v_character jsonb;
  v_order smallint;
  v_session_id uuid;
  v_index integer;
  v_character_index integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_scenario_id is null then
    v_scenario_id := gen_random_uuid();
  elsif exists (
    select 1 from public.scenarios
    where id = p_scenario_id and owner_id <> v_user_id
  ) then
    raise exception 'scenario owner does not match authenticated user'
      using errcode = '42501';
  end if;

  if exists (select 1 from public.scenarios where id = v_scenario_id) then
    update public.scenarios
    set title = nullif(btrim(p_scenario->>'title'), ''),
        system = nullif(btrim(p_scenario->>'system'), ''),
        scenario_type = case p_scenario->>'scenarioType'
          when 'kpLess' then 'kp_less'
          else p_scenario->>'scenarioType'
        end,
        author = nullif(btrim(p_scenario->>'author'), ''),
        stage = nullif(btrim(p_scenario->>'stage'), ''),
        player_count_type = p_scenario->>'playerCountType',
        player_count_fixed = (p_scenario->>'playerCountFixed')::smallint,
        player_count_min = (p_scenario->>'playerCountMin')::smallint,
        player_count_max = (p_scenario->>'playerCountMax')::smallint,
        player_count_text = nullif(btrim(p_scenario->>'playerCountText'), ''),
        play_time_type = p_scenario->>'playTimeType',
        play_time_fixed = (p_scenario->>'playTimeFixed')::smallint,
        play_time_min = (p_scenario->>'playTimeMin')::smallint,
        play_time_max = (p_scenario->>'playTimeMax')::smallint,
        play_time_text = nullif(btrim(p_scenario->>'playTimeText'), ''),
        recommended_skills = nullif(btrim(p_scenario->>'recommendedSkills'), ''),
        secondary_skills = nullif(btrim(p_scenario->>'secondarySkills'), ''),
        not_recommended = nullif(btrim(p_scenario->>'notRecommended'), ''),
        lost_rate = nullif(p_scenario->>'lostRate', ''),
        lost_rate_note = nullif(btrim(p_scenario->>'lostRateNote'), ''),
        ho_type = nullif(p_scenario->>'hoType', ''),
        scenario_tags = coalesce(
          array(select jsonb_array_elements_text(p_scenario->'scenarioTags')),
          '{}'::text[]
        ),
        battle = nullif(p_scenario->>'battle', ''),
        cautions = nullif(btrim(p_scenario->>'cautions'), ''),
        trailer_text = nullif(btrim(p_scenario->>'trailerText'), '')
    where id = v_scenario_id and owner_id = v_user_id;
  else
    insert into public.scenarios (
      id, owner_id, title, system, scenario_type, author, stage,
      player_count_type, player_count_fixed, player_count_min,
      player_count_max, player_count_text, play_time_type,
      play_time_fixed, play_time_min, play_time_max, play_time_text,
      recommended_skills, secondary_skills, not_recommended, lost_rate,
      lost_rate_note, ho_type, scenario_tags, battle, cautions, trailer_text
    ) values (
      v_scenario_id, v_user_id,
      nullif(btrim(p_scenario->>'title'), ''),
      nullif(btrim(p_scenario->>'system'), ''),
      case p_scenario->>'scenarioType'
        when 'kpLess' then 'kp_less'
        else p_scenario->>'scenarioType'
      end,
      nullif(btrim(p_scenario->>'author'), ''),
      nullif(btrim(p_scenario->>'stage'), ''),
      p_scenario->>'playerCountType',
      (p_scenario->>'playerCountFixed')::smallint,
      (p_scenario->>'playerCountMin')::smallint,
      (p_scenario->>'playerCountMax')::smallint,
      nullif(btrim(p_scenario->>'playerCountText'), ''),
      p_scenario->>'playTimeType',
      (p_scenario->>'playTimeFixed')::smallint,
      (p_scenario->>'playTimeMin')::smallint,
      (p_scenario->>'playTimeMax')::smallint,
      nullif(btrim(p_scenario->>'playTimeText'), ''),
      nullif(btrim(p_scenario->>'recommendedSkills'), ''),
      nullif(btrim(p_scenario->>'secondarySkills'), ''),
      nullif(btrim(p_scenario->>'notRecommended'), ''),
      nullif(p_scenario->>'lostRate', ''),
      nullif(btrim(p_scenario->>'lostRateNote'), ''),
      nullif(p_scenario->>'hoType', ''),
      coalesce(array(select jsonb_array_elements_text(p_scenario->'scenarioTags')), '{}'::text[]),
      nullif(p_scenario->>'battle', ''),
      nullif(btrim(p_scenario->>'cautions'), ''),
      nullif(btrim(p_scenario->>'trailerText'), '')
    );
  end if;

  if not exists (
    select 1 from public.scenarios
    where id = v_scenario_id and owner_id = v_user_id
  ) then
    raise exception 'scenario was not saved' using errcode = '42501';
  end if;

  insert into public.user_scenario_data (
    user_id, scenario_id, favorite, kp_status, play_status, purchase_url, memo
  ) values (
    v_user_id, v_scenario_id,
    coalesce((p_user_data->>'favorite')::boolean, false),
    case when coalesce((p_user_data->>'kpCompleted')::boolean, false)
      then 'completed' else 'not_started' end,
    case when coalesce((p_user_data->>'playCompleted')::boolean, false)
      then 'completed' else 'not_started' end,
    nullif(btrim(p_user_data->>'purchaseUrl'), ''),
    nullif(btrim(p_user_data->>'memo'), '')
  )
  on conflict (user_id, scenario_id) do update set
    favorite = excluded.favorite,
    kp_status = excluded.kp_status,
    play_status = excluded.play_status,
    purchase_url = excluded.purchase_url,
    memo = excluded.memo;

  delete from public.scenario_handouts where scenario_id = v_scenario_id;
  v_order := 0;
  for v_item in select value from jsonb_array_elements(coalesce(p_handouts, '[]'::jsonb)) loop
    if nullif(btrim(v_item->>'content'), '') is not null then
      v_order := v_order + 1;
      insert into public.scenario_handouts (scenario_id, display_order, label, content)
      values (v_scenario_id, v_order, nullif(btrim(v_item->>'label'), ''), btrim(v_item->>'content'));
    end if;
  end loop;

  delete from public.scenario_episodes where scenario_id = v_scenario_id;
  v_order := 0;
  for v_item in select value from jsonb_array_elements(coalesce(p_episodes, '[]'::jsonb)) loop
    v_order := v_order + 1;
    insert into public.scenario_episodes (
      scenario_id, episode_number, title, time_type, time_fixed,
      time_min, time_max, time_text, summary, status, play_date
    ) values (
      v_scenario_id, v_order, nullif(btrim(v_item->>'title'), ''),
      v_item->>'timeType', (v_item->>'timeFixed')::smallint,
      (v_item->>'timeMin')::smallint, (v_item->>'timeMax')::smallint,
      nullif(btrim(v_item->>'timeText'), ''), v_item->>'summary',
      v_item->>'status', nullif(v_item->>'playDate', '')::date
    );
  end loop;

  delete from public.scenario_sessions where scenario_id = v_scenario_id;
  for v_index in 0..jsonb_array_length(coalesce(p_sessions, '[]'::jsonb)) - 1 loop
    v_item := coalesce(p_sessions, '[]'::jsonb)->v_index;
    insert into public.scenario_sessions (scenario_id, display_order, name, role)
    values (v_scenario_id, (v_index + 1)::smallint, nullif(btrim(v_item->>'name'), ''), v_item->>'role')
    returning id into v_session_id;

    for v_character_index in 0..jsonb_array_length(coalesce(v_item->'characters', '[]'::jsonb)) - 1 loop
      v_character := coalesce(v_item->'characters', '[]'::jsonb)->v_character_index;
      insert into public.scenario_session_characters (
        session_id, display_order, name, player_name, iachara_url, ho,
        memo, portrait_storage_path
      ) values (
        v_session_id,
        (v_character_index + 1)::smallint,
        nullif(btrim(v_character->>'name'), ''),
        nullif(btrim(v_character->>'playerName'), ''),
        nullif(btrim(v_character->>'iacharaUrl'), ''),
        nullif(btrim(v_character->>'ho'), ''),
        nullif(btrim(v_character->>'memo'), ''),
        nullif(btrim(v_character->>'portraitStoragePath'), '')
      );
    end loop;
  end loop;

  return v_scenario_id;
end;
$$;

revoke all on function public.save_scenario_aggregate(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function public.save_scenario_aggregate(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;
