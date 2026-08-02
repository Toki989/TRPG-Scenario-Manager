-- Store one optional character portrait per participation-record character.
-- The binary remains in the private scenario-images bucket; this column stores
-- only its Storage path and is included in scenario backup metadata.

alter table public.scenario_session_characters
  add column if not exists portrait_storage_path text;

alter table public.scenario_session_characters
  drop constraint if exists scenario_session_characters_portrait_path_not_blank;

alter table public.scenario_session_characters
  add constraint scenario_session_characters_portrait_path_not_blank
  check (
    portrait_storage_path is null
    or length(btrim(replace(portrait_storage_path, '　', ' '))) > 0
  );

create index if not exists scenario_session_characters_portrait_path_idx
  on public.scenario_session_characters (portrait_storage_path)
  where portrait_storage_path is not null;

drop policy if exists storage_scenario_images_select_owner_or_shared on storage.objects;

create policy storage_scenario_images_select_owner_or_shared
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'scenario-images'
    and (
      (
        storage.objects.owner_id = (select auth.uid())::text
        and exists (
          select 1
          from public.scenarios as s
          where s.id::text = (storage.foldername(storage.objects.name))[1]
            and s.owner_id = (select auth.uid())
        )
      )
      or exists (
        select 1
        from public.scenario_images as si
        where si.storage_path = storage.objects.name
          and (select private.can_view_scenario(
            si.scenario_id,
            (select auth.uid())
          ))
      )
      or exists (
        select 1
        from public.scenario_session_characters as character
        join public.scenario_sessions as session
          on session.id = character.session_id
        where character.portrait_storage_path = storage.objects.name
          and (select private.can_view_scenario(
            session.scenario_id,
            (select auth.uid())
          ))
      )
    )
  );
