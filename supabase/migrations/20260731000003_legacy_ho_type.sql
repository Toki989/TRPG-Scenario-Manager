-- Preserve the old application's distinct "秘匿HOあり" value.
alter table public.scenarios
  drop constraint if exists scenarios_ho_type_check;

alter table public.scenarios
  add constraint scenarios_ho_type_check
  check (ho_type is null or ho_type in (
    'none', 'common', 'individual', 'secret', 'common_individual', 'special'
  ));
