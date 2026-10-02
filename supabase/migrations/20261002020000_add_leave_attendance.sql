alter type public.attendance_status add value if not exists 'leave';

alter table public.settings
  add column if not exists leave_calculation_policy text not null default 'exclude_leave';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'settings_leave_calculation_policy_check'
      and conrelid = 'public.settings'::regclass
  ) then
    alter table public.settings
      add constraint settings_leave_calculation_policy_check
      check (leave_calculation_policy in ('exclude_leave','count_leave_as_absent'));
  end if;
end $$;