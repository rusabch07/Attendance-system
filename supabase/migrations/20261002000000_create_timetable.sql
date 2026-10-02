-- Phase 1: weekly class timetable. This migration does not change attendance data.
create table public.timetable (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  section text not null check (length(btrim(section)) > 0),
  day_of_week integer not null check (day_of_week between 1 and 7),
  start_time time not null,
  end_time time not null,
  room text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint timetable_valid_time_range check (end_time > start_time)
);

create index timetable_active_day_start_idx
  on public.timetable(day_of_week, start_time)
  where is_active;

create index timetable_subject_idx
  on public.timetable(subject_id);

alter table public.timetable enable row level security;

create policy "authorized read timetable"
  on public.timetable for select to authenticated
  using (public.is_attendance_user());

create policy "authorized insert timetable"
  on public.timetable for insert to authenticated
  with check (public.is_attendance_user());

create policy "authorized update timetable"
  on public.timetable for update to authenticated
  using (public.is_attendance_user())
  with check (public.is_attendance_user());

create policy "authorized delete timetable"
  on public.timetable for delete to authenticated
  using (public.is_attendance_user());

grant select, insert, update, delete on table public.timetable to authenticated;
