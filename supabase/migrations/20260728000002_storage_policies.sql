-- TRPG Scenario Manager
-- Storage policies for private avatar and scenario-image buckets.
-- Create the buckets in Supabase as private buckets before applying these
-- policies, or create them separately through the Storage configuration.

-- Expected avatar path:
--   avatars/{auth-user-id}/{uuid}.webp
-- Only the owner can access or manage their avatar objects.
create policy storage_avatars_select_owner
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy storage_avatars_insert_owner
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy storage_avatars_update_owner
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and owner_id = (select auth.uid())::text
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and owner_id = (select auth.uid())::text
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy storage_avatars_delete_owner
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and owner_id = (select auth.uid())::text
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Expected scenario-image path:
--   scenario-images/{scenario-id}/{uuid}.webp
-- Owners can manage images. Shared users can read only objects that are
-- registered in scenario_images and whose parent scenario they can view.
create policy storage_scenario_images_select_owner_or_shared
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'scenario-images'
    and (
      (
        owner_id = (select auth.uid())::text
        and exists (
          select 1
          from public.scenarios as s
          where s.id::text = (storage.foldername(name))[1]
            and s.owner_id = (select auth.uid())
        )
      )
      or exists (
        select 1
        from public.scenario_images as si
        where si.storage_path = name
          and (select private.can_view_scenario(
            si.scenario_id,
            (select auth.uid())
          ))
      )
    )
  );

create policy storage_scenario_images_insert_owner
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'scenario-images'
    and (storage.foldername(name))[1] is not null
    and exists (
      select 1
      from public.scenarios as s
      where s.id::text = (storage.foldername(name))[1]
        and s.owner_id = (select auth.uid())
    )
  );

create policy storage_scenario_images_update_owner
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'scenario-images'
    and owner_id = (select auth.uid())::text
    and exists (
      select 1
      from public.scenarios as s
      where s.id::text = (storage.foldername(name))[1]
        and s.owner_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'scenario-images'
    and owner_id = (select auth.uid())::text
    and exists (
      select 1
      from public.scenarios as s
      where s.id::text = (storage.foldername(name))[1]
        and s.owner_id = (select auth.uid())
    )
  );

create policy storage_scenario_images_delete_owner
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'scenario-images'
    and owner_id = (select auth.uid())::text
    and exists (
      select 1
      from public.scenarios as s
      where s.id::text = (storage.foldername(name))[1]
        and s.owner_id = (select auth.uid())
    )
  );
