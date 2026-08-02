-- Return only the share records for a scenario owned by the current user.
-- The recipient's display name is needed by the owner to manage the list,
-- while profiles remain private to normal table reads.
create or replace function public.list_scenario_shares(
  p_scenario_id uuid
)
returns table (
  id uuid,
  shared_user_id uuid,
  display_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select ss.id, ss.shared_user_id, p.display_name, ss.created_at
  from public.scenario_shares as ss
  join public.profiles as p on p.id = ss.shared_user_id
  join public.scenarios as s on s.id = ss.scenario_id
  where ss.scenario_id = p_scenario_id
    and s.owner_id = auth.uid()
  order by ss.created_at;
$$;

revoke all on function public.list_scenario_shares(uuid) from public;
grant execute on function public.list_scenario_shares(uuid) to authenticated;
