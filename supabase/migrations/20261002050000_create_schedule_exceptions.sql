-- Phase 6: Schedule exceptions (cancelled classes, breaks/no-class, and rescheduled classes).
-- Allows specific date overrides without permanently altering the recurring weekly timetable.
begin;

create table if not exists public.schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null default '00000000-0000-0000-0000-000000000001' references public.sections(id) on delete cascade,
  schedule_slot_id uuid references public.timetable(id) on delete cascade,
  exception_date date not null,
  exception_type text not null check (exception_type in ('cancelled', 'break', 'rescheduled')),
  reason text,
  new_date date,
  new_start_time time,
  new_end_time time,
  new_room text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint schedule_exceptions_rescheduled_check check (
    exception_type <> 'rescheduled' or (
      new_date is not null
      and new_start_time is not null
      and new_end_time is not null
      and new_end_time > new_start_time
    )
  ),
  constraint schedule_exceptions_slot_date_unique unique (section_id, schedule_slot_id, exception_date)
);

create index if not exists schedule_exceptions_section_date_idx
  on public.schedule_exceptions(section_id, exception_date);

create index if not exists schedule_exceptions_new_date_idx
  on public.schedule_exceptions(new_date, section_id)
  where new_date is not null;

create index if not exists schedule_exceptions_slot_idx
  on public.schedule_exceptions(schedule_slot_id);

alter table public.schedule_exceptions enable row level security;

drop policy if exists "section scoped schedule exceptions" on public.schedule_exceptions;
create policy "section scoped schedule exceptions" on public.schedule_exceptions
  for all to authenticated
  using (public.can_access_section(section_id))
  with check (public.can_access_section(section_id));

grant select, insert, update, delete on public.schedule_exceptions to authenticated;

commit;
