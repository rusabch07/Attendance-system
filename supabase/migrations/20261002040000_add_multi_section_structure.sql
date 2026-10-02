-- Phase 5: add section ownership without deleting or rewriting existing business data.
begin;

create table if not exists public.sections (
  id uuid primary key default gen_random_uuid(),
  section_name text not null,
  section_code text not null unique,
  department text not null,
  batch text not null,
  semester text not null,
  login_id text unique,
  is_active boolean not null default true
);

-- Use one deterministic default section for legacy records and old clients that
-- do not yet send section_id. The login identifier is only stored, not enabled.
do $$
declare
  default_section_id uuid;
  target_table text;
begin
  insert into public.sections(id, section_name, section_code, department, batch, semester, login_id, is_active)
  values ('00000000-0000-0000-0000-000000000001', 'Section A', 'EE-A', 'Electrical Engineering', '2025', 'Semester 2', 'EE-A-01', true)
  on conflict (section_code) do update
    set section_name = excluded.section_name,
        department = excluded.department,
        batch = excluded.batch,
        semester = excluded.semester,
        login_id = excluded.login_id,
        is_active = excluded.is_active
  returning id into default_section_id;

  foreach target_table in array array['students','subjects','timetable','lectures','student_leaves','settings','profiles'] loop
    execute format('alter table public.%I add column if not exists section_id uuid references public.sections(id)', target_table);
    execute format('update public.%I set section_id = $1 where section_id is null', target_table) using default_section_id;
    execute format('alter table public.%I alter column section_id set default %L', target_table, default_section_id);
    execute format('alter table public.%I alter column section_id set not null', target_table);
    execute format('create index if not exists %I on public.%I(section_id)', target_table || '_section_id_idx', target_table);
  end loop;
end $$;

create or replace function public.current_section_id()
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.section_id from public.profiles p where p.user_id = auth.uid() limit 1
$$;
revoke all on function public.current_section_id() from public;
grant execute on function public.current_section_id() to authenticated;

create or replace function public.can_access_section(target_section_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.is_attendance_admin()
    or (public.is_attendance_user() and target_section_id = public.current_section_id())
$$;
revoke all on function public.can_access_section(uuid) from public;
grant execute on function public.can_access_section(uuid) to authenticated;

create or replace function public.can_access_attendance(target_lecture_id uuid, target_student_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.is_attendance_admin() or (
    public.is_attendance_user() and exists (
      select 1
      from public.lectures l
      join public.students s on s.id = target_student_id
      where l.id = target_lecture_id
        and l.section_id = s.section_id
        and l.section_id = public.current_section_id()
    )
  )
$$;
revoke all on function public.can_access_attendance(uuid, uuid) from public;
grant execute on function public.can_access_attendance(uuid, uuid) to authenticated;

alter table public.sections enable row level security;
drop policy if exists "section users read own section" on public.sections;
create policy "section users read own section" on public.sections
  for select to authenticated
  using (public.can_access_section(id));
drop policy if exists "admins manage sections" on public.sections;
create policy "admins manage sections" on public.sections
  for all to authenticated
  using (public.is_attendance_admin())
  with check (public.is_attendance_admin());
grant select, insert, update, delete on public.sections to authenticated;

-- Replace broad legacy policies; permissive PostgreSQL policies combine with OR.
drop policy if exists "profiles read own or admin" on public.profiles;
drop policy if exists "profiles update own or admin" on public.profiles;
drop policy if exists "admins read all profiles" on public.profiles;
drop policy if exists "admins update all profiles" on public.profiles;
drop policy if exists "admins manage all profiles" on public.profiles;
drop policy if exists "users read own section profile" on public.profiles;
drop policy if exists "users update own section profile" on public.profiles;
create policy "admins read all profiles" on public.profiles
  for select to authenticated using (public.is_attendance_admin());
create policy "admins update all profiles" on public.profiles
  for update to authenticated
  using (public.is_attendance_admin())
  with check (public.is_attendance_admin());
create policy "users read own section profile" on public.profiles
  for select to authenticated
  using (user_id = auth.uid() and public.can_access_section(section_id));
create policy "users update own section profile" on public.profiles
  for update to authenticated
  using (user_id = auth.uid() and public.can_access_section(section_id))
  with check (user_id = auth.uid() and section_id = public.current_section_id());

-- Each section-owned table is restricted to its section, with admins bypassing the scope.
drop policy if exists "authorized read students" on public.students;
drop policy if exists "authorized insert students" on public.students;
drop policy if exists "authorized update students" on public.students;
drop policy if exists "authorized delete students" on public.students;
drop policy if exists "section scoped students" on public.students;
create policy "section scoped students" on public.students for all to authenticated
  using (public.can_access_section(section_id)) with check (public.can_access_section(section_id));

drop policy if exists "authorized read subjects" on public.subjects;
drop policy if exists "authorized insert subjects" on public.subjects;
drop policy if exists "authorized update subjects" on public.subjects;
drop policy if exists "authorized delete subjects" on public.subjects;
drop policy if exists "section scoped subjects" on public.subjects;
create policy "section scoped subjects" on public.subjects for all to authenticated
  using (public.can_access_section(section_id)) with check (public.can_access_section(section_id));

drop policy if exists "authorized read timetable" on public.timetable;
drop policy if exists "authorized insert timetable" on public.timetable;
drop policy if exists "authorized update timetable" on public.timetable;
drop policy if exists "authorized delete timetable" on public.timetable;
drop policy if exists "section scoped timetable" on public.timetable;
create policy "section scoped timetable" on public.timetable for all to authenticated
  using (public.can_access_section(section_id)) with check (public.can_access_section(section_id));

drop policy if exists "authorized read lectures" on public.lectures;
drop policy if exists "authorized insert lectures" on public.lectures;
drop policy if exists "authorized update lectures" on public.lectures;
drop policy if exists "authorized delete lectures" on public.lectures;
drop policy if exists "section scoped lectures" on public.lectures;
create policy "section scoped lectures" on public.lectures for all to authenticated
  using (public.can_access_section(section_id)) with check (public.can_access_section(section_id));

drop policy if exists "authorized read student leaves" on public.student_leaves;
drop policy if exists "authorized insert student leaves" on public.student_leaves;
drop policy if exists "authorized update student leaves" on public.student_leaves;
drop policy if exists "authorized delete student leaves" on public.student_leaves;
drop policy if exists "section scoped student leaves" on public.student_leaves;
create policy "section scoped student leaves" on public.student_leaves for all to authenticated
  using (public.can_access_section(section_id)) with check (public.can_access_section(section_id));

-- Settings previously allowed select/insert/update but not delete.
drop policy if exists "authorized read settings" on public.settings;
drop policy if exists "authorized insert settings" on public.settings;
drop policy if exists "authorized update settings" on public.settings;
drop policy if exists "section scoped settings read" on public.settings;
drop policy if exists "section scoped settings insert" on public.settings;
drop policy if exists "section scoped settings update" on public.settings;
create policy "section scoped settings read" on public.settings for select to authenticated
  using (public.can_access_section(section_id));
create policy "section scoped settings insert" on public.settings for insert to authenticated
  with check (public.can_access_section(section_id));
create policy "section scoped settings update" on public.settings for update to authenticated
  using (public.can_access_section(section_id))
  with check (public.can_access_section(section_id));

-- Attendance inherits scope from both its lecture and student; it has no section_id column.
drop policy if exists "authorized read attendance" on public.attendance;
drop policy if exists "authorized insert attendance" on public.attendance;
drop policy if exists "authorized update attendance" on public.attendance;
drop policy if exists "authorized delete attendance" on public.attendance;
drop policy if exists "section scoped attendance" on public.attendance;
create policy "section scoped attendance" on public.attendance for all to authenticated
  using (public.can_access_attendance(lecture_id, student_id))
  with check (public.can_access_attendance(lecture_id, student_id));

commit;
