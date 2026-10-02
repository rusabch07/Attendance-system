-- Phase 5: add multi-section and academic group structure without deleting or rewriting existing business data.
begin;

-- Academic groups group departments, batches, and semesters.
create table if not exists public.academic_groups (
  id uuid primary key default gen_random_uuid(),
  department text not null,
  batch text not null,
  semester text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint academic_groups_dept_batch_semester_key unique (department, batch, semester)
);

-- Sections belong to an academic group. section_code is globally unique (e.g. EE-25-A, EE-24-A).
-- login_id is globally unique. section_name (e.g. "Section A") may repeat across academic groups.
create table if not exists public.sections (
  id uuid primary key default gen_random_uuid(),
  academic_group_id uuid not null references public.academic_groups(id) on delete cascade,
  section_name text not null,
  section_code text not null unique,
  department text not null,
  batch text not null,
  semester text not null,
  login_id text unique,
  is_active boolean not null default true
);

-- Use deterministic default records for legacy records and old clients that do not yet send identifiers.
do $$
declare
  default_academic_group_id uuid;
  default_section_id uuid;
  target_table text;
  old_cname text;
begin
  -- 1. Seed deterministic default academic group
  insert into public.academic_groups(id, department, batch, semester, is_active)
  values ('00000000-0000-0000-0000-000000000001', 'Electrical Engineering', '2025', 'Semester 2', true)
  on conflict (id) do update
    set department = excluded.department,
        batch = excluded.batch,
        semester = excluded.semester,
        is_active = excluded.is_active
  returning id into default_academic_group_id;

  -- Ensure sections table has academic_group_id if table pre-existed
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sections' and column_name = 'academic_group_id'
  ) then
    alter table public.sections add column academic_group_id uuid references public.academic_groups(id) on delete cascade;
    update public.sections set academic_group_id = default_academic_group_id where academic_group_id is null;
    alter table public.sections alter column academic_group_id set not null;
  end if;

  -- Ensure section_code has a global unique constraint (clean up any prior composite uniqueness)
  if exists (
    select 1 from pg_constraint
    where conname = 'sections_academic_group_id_section_code_key' and conrelid = 'public.sections'::regclass
  ) then
    alter table public.sections drop constraint sections_academic_group_id_section_code_key;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'sections_section_code_key' and conrelid = 'public.sections'::regclass
  ) then
    alter table public.sections add constraint sections_section_code_key unique (section_code);
  end if;

  -- 2. Seed deterministic default section (globally unique section_code)
  insert into public.sections(id, academic_group_id, section_name, section_code, department, batch, semester, login_id, is_active)
  values ('00000000-0000-0000-0000-000000000001', default_academic_group_id, 'Section A', 'EE-A', 'Electrical Engineering', '2025', 'Semester 2', 'EE-A-01', true)
  on conflict (section_code) do update
    set academic_group_id = excluded.academic_group_id,
        section_name = excluded.section_name,
        department = excluded.department,
        batch = excluded.batch,
        semester = excluded.semester,
        login_id = excluded.login_id,
        is_active = excluded.is_active
  returning id into default_section_id;

  -- 3. Subjects belong to academic_groups and are shared by all sections in that group.
  alter table public.subjects add column if not exists academic_group_id uuid references public.academic_groups(id) on delete cascade;
  update public.subjects set academic_group_id = default_academic_group_id where academic_group_id is null;
  execute format('alter table public.subjects alter column academic_group_id set default %L', default_academic_group_id);
  alter table public.subjects alter column academic_group_id set not null;
  create index if not exists subjects_academic_group_id_idx on public.subjects(academic_group_id);

  -- Replace global subject_code uniqueness with unique(academic_group_id, subject_code)
  for old_cname in (
    select c.conname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'subjects'
      and c.contype = 'u'
      and array(
        select a.attname
        from unnest(c.conkey) with ordinality as k(attnum, ord)
        join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum
        order by k.ord
      ) = array['subject_code']
  ) loop
    execute format('alter table public.subjects drop constraint %I', old_cname);
  end loop;

  if exists (
    select 1 from pg_constraint
    where conname = 'subjects_subject_code_key' and conrelid = 'public.subjects'::regclass
  ) then
    alter table public.subjects drop constraint subjects_subject_code_key;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'subjects_academic_group_id_subject_code_key' and conrelid = 'public.subjects'::regclass
  ) then
    alter table public.subjects add constraint subjects_academic_group_id_subject_code_key unique (academic_group_id, subject_code);
  end if;

  -- 4. Section-scoped tables: students, timetable, lectures, student_leaves, settings, profiles
  foreach target_table in array array['students','timetable','lectures','student_leaves','settings','profiles'] loop
    execute format('alter table public.%I add column if not exists section_id uuid references public.sections(id)', target_table);
    execute format('update public.%I set section_id = $1 where section_id is null', target_table) using default_section_id;
    execute format('alter table public.%I alter column section_id set default %L', target_table, default_section_id);
    execute format('alter table public.%I alter column section_id set not null', target_table);
    execute format('create index if not exists %I on public.%I(section_id)', target_table || '_section_id_idx', target_table);
  end loop;

  -- 5. Update lecture uniqueness to include section_id: unique(section_id, subject_id, lecture_date, lecture_number)
  for old_cname in (
    select c.conname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'lectures'
      and c.contype = 'u'
      and array(
        select a.attname
        from unnest(c.conkey) with ordinality as k(attnum, ord)
        join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum
        order by k.ord
      ) = array['subject_id', 'lecture_date', 'lecture_number']
  ) loop
    execute format('alter table public.lectures drop constraint %I', old_cname);
  end loop;

  if exists (
    select 1 from pg_constraint
    where conname = 'lectures_subject_id_lecture_date_lecture_number_key' and conrelid = 'public.lectures'::regclass
  ) then
    alter table public.lectures drop constraint lectures_subject_id_lecture_date_lecture_number_key;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'lectures_section_subject_date_number_key' and conrelid = 'public.lectures'::regclass
  ) then
    alter table public.lectures add constraint lectures_section_subject_date_number_key unique (section_id, subject_id, lecture_date, lecture_number);
  end if;
end $$;

-- Section & Academic Group context functions
create or replace function public.current_section_id()
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select p.section_id from public.profiles p where p.user_id = auth.uid() limit 1
$$;
revoke all on function public.current_section_id() from public;
grant execute on function public.current_section_id() to authenticated;

create or replace function public.current_academic_group_id()
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select s.academic_group_id
  from public.profiles p
  join public.sections s on s.id = p.section_id
  where p.user_id = auth.uid()
  limit 1
$$;
revoke all on function public.current_academic_group_id() from public;
grant execute on function public.current_academic_group_id() to authenticated;

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

create or replace function public.can_access_academic_group(target_academic_group_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select public.is_attendance_admin()
    or (public.is_attendance_user() and target_academic_group_id = public.current_academic_group_id())
$$;
revoke all on function public.can_access_academic_group(uuid) from public;
grant execute on function public.can_access_academic_group(uuid) to authenticated;

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

-- Academic groups RLS
alter table public.academic_groups enable row level security;
drop policy if exists "academic groups read access" on public.academic_groups;
drop policy if exists "admins manage academic groups" on public.academic_groups;
create policy "academic groups read access" on public.academic_groups
  for select to authenticated
  using (public.can_access_academic_group(id));
create policy "admins manage academic groups" on public.academic_groups
  for all to authenticated
  using (public.is_attendance_admin())
  with check (public.is_attendance_admin());
grant select, insert, update, delete on public.academic_groups to authenticated;

-- Sections RLS
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

-- Profiles: database-level protection against role escalation and section reassignment
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_attendance_admin() then
    if new.role is distinct from old.role then
      raise exception 'Only administrators can change user roles';
    end if;
    if new.section_id is distinct from old.section_id then
      raise exception 'Only administrators can change user section assignment';
    end if;
    if new.user_id is distinct from old.user_id then
      raise exception 'Cannot change user_id';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_profile_fields on public.profiles;
create trigger trg_protect_profile_fields
  before update on public.profiles
  for each row
  execute function public.protect_profile_fields();

-- Profiles RLS: normal users only update their own profile row without circular queries
drop policy if exists "profiles read own or admin" on public.profiles;
drop policy if exists "profiles update own or admin" on public.profiles;
drop policy if exists "admins read all profiles" on public.profiles;
drop policy if exists "admins update all profiles" on public.profiles;
drop policy if exists "admins manage all profiles" on public.profiles;
drop policy if exists "users read own section profile" on public.profiles;
drop policy if exists "users update own section profile" on public.profiles;
drop policy if exists "users read own profile" on public.profiles;
drop policy if exists "users update own profile" on public.profiles;

create policy "admins read all profiles" on public.profiles
  for select to authenticated
  using (public.is_attendance_admin());
create policy "admins update all profiles" on public.profiles
  for update to authenticated
  using (public.is_attendance_admin())
  with check (public.is_attendance_admin());
create policy "users read own profile" on public.profiles
  for select to authenticated
  using (user_id = auth.uid());
create policy "users update own profile" on public.profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Shared Subjects: RLS policies
-- CR/GR accounts can only READ subjects belonging to their academic group.
-- Only Admin/Faculty can INSERT, UPDATE, or DELETE shared subjects.
drop policy if exists "authorized read subjects" on public.subjects;
drop policy if exists "authorized insert subjects" on public.subjects;
drop policy if exists "authorized update subjects" on public.subjects;
drop policy if exists "authorized delete subjects" on public.subjects;
drop policy if exists "section scoped subjects" on public.subjects;
drop policy if exists "section users read group subjects" on public.subjects;
drop policy if exists "admins manage subjects" on public.subjects;

create policy "section users read group subjects" on public.subjects
  for select to authenticated
  using (
    public.is_attendance_admin()
    or (
      public.is_attendance_user()
      and academic_group_id = public.current_academic_group_id()
    )
  );

create policy "admins manage subjects" on public.subjects
  for all to authenticated
  using (public.is_attendance_admin())
  with check (public.is_attendance_admin());

grant select, insert, update, delete on public.subjects to authenticated;

-- Data Integrity: Validate that timetable and lecture rows reference a subject
-- belonging to the same academic group as their section. Cross-session references are blocked.
create or replace function public.validate_section_subject_academic_group()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_section_group_id uuid;
  v_subject_group_id uuid;
begin
  select s.academic_group_id into v_section_group_id
  from public.sections s
  where s.id = new.section_id;

  select sub.academic_group_id into v_subject_group_id
  from public.subjects sub
  where sub.id = new.subject_id;

  if v_section_group_id is not null and v_subject_group_id is not null then
    if v_section_group_id <> v_subject_group_id then
      raise exception 'Cross-academic-group reference blocked: section % (group %) and subject % (group %) belong to different academic groups',
        new.section_id, v_section_group_id, new.subject_id, v_subject_group_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_timetable_academic_group on public.timetable;
create trigger trg_validate_timetable_academic_group
  before insert or update of section_id, subject_id on public.timetable
  for each row
  execute function public.validate_section_subject_academic_group();

drop trigger if exists trg_validate_lecture_academic_group on public.lectures;
create trigger trg_validate_lecture_academic_group
  before insert or update of section_id, subject_id on public.lectures
  for each row
  execute function public.validate_section_subject_academic_group();

-- Section-scoped business tables RLS
drop policy if exists "authorized read students" on public.students;
drop policy if exists "authorized insert students" on public.students;
drop policy if exists "authorized update students" on public.students;
drop policy if exists "authorized delete students" on public.students;
drop policy if exists "section scoped students" on public.students;
create policy "section scoped students" on public.students for all to authenticated
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

-- Settings
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
