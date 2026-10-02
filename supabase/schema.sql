-- Run this file once in Supabase → SQL Editor.
create extension if not exists pgcrypto;

create type public.user_role as enum ('admin','cr');
create type public.attendance_status as enum ('present','absent','leave');

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  role public.user_role not null default 'cr',
  created_at timestamptz not null default now()
);
create table public.students (
  id uuid primary key default gen_random_uuid(),
  roll_no text not null unique,
  registration_no text not null,
  name text not null,
  section text not null,
  semester text not null,
  email text,
  phone text,
  created_at timestamptz not null default now()
);
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  subject_name text not null,
  subject_code text not null unique,
  teacher_name text not null,
  semester text not null,
  section text not null,
  credit_hours smallint check (credit_hours between 1 and 6),
  created_at timestamptz not null default now()
);
create table public.lectures (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  lecture_number integer not null check (lecture_number > 0),
  lecture_date date not null,
  section text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(subject_id, lecture_date, lecture_number)
);
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  lecture_id uuid not null references public.lectures(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  status public.attendance_status not null,
  marked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(lecture_id, student_id)
);
create table public.settings (
  id uuid primary key default gen_random_uuid(),
  class_name text not null default 'My Class',
  semester_name text not null default 'Current Semester',
  university_name text not null default 'University',
  minimum_attendance numeric(5,2) not null default 75 check (minimum_attendance > 0 and minimum_attendance <= 100),
  leave_calculation_policy text not null default 'exclude_leave' check (leave_calculation_policy in ('exclude_leave','count_leave_as_absent')),
  updated_at timestamptz not null default now()
);

create index lectures_subject_date_idx on public.lectures(subject_id, lecture_date desc);
create index attendance_lecture_idx on public.attendance(lecture_id);
create index attendance_student_idx on public.attendance(student_id);
create index students_section_idx on public.students(section);

create or replace function public.is_attendance_user()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles where user_id=auth.uid() and role in ('admin','cr')) $$;
revoke all on function public.is_attendance_user() from public;
grant execute on function public.is_attendance_user() to authenticated;
create or replace function public.is_attendance_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles where user_id=auth.uid() and role='admin') $$;
revoke all on function public.is_attendance_admin() from public;
grant execute on function public.is_attendance_admin() to authenticated;

alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.subjects enable row level security;
alter table public.lectures enable row level security;
alter table public.attendance enable row level security;
alter table public.settings enable row level security;

create policy "profiles read own or admin" on public.profiles for select to authenticated
using (user_id=auth.uid() or public.is_attendance_admin());
create policy "profiles update own or admin" on public.profiles for update to authenticated
using (user_id=auth.uid() or public.is_attendance_admin())
with check (user_id=auth.uid() or public.is_attendance_admin());

create policy "authorized read students" on public.students for select to authenticated using (public.is_attendance_user());
create policy "authorized insert students" on public.students for insert to authenticated with check (public.is_attendance_user());
create policy "authorized update students" on public.students for update to authenticated using (public.is_attendance_user()) with check (public.is_attendance_user());
create policy "authorized delete students" on public.students for delete to authenticated using (public.is_attendance_user());
create policy "authorized read subjects" on public.subjects for select to authenticated using (public.is_attendance_user());
create policy "authorized insert subjects" on public.subjects for insert to authenticated with check (public.is_attendance_user());
create policy "authorized update subjects" on public.subjects for update to authenticated using (public.is_attendance_user()) with check (public.is_attendance_user());
create policy "authorized delete subjects" on public.subjects for delete to authenticated using (public.is_attendance_user());
create policy "authorized read lectures" on public.lectures for select to authenticated using (public.is_attendance_user());
create policy "authorized insert lectures" on public.lectures for insert to authenticated with check (public.is_attendance_user() and created_by=auth.uid());
create policy "authorized update lectures" on public.lectures for update to authenticated using (public.is_attendance_user()) with check (public.is_attendance_user());
create policy "authorized delete lectures" on public.lectures for delete to authenticated using (public.is_attendance_user());
create policy "authorized read attendance" on public.attendance for select to authenticated using (public.is_attendance_user());
create policy "authorized insert attendance" on public.attendance for insert to authenticated with check (public.is_attendance_user());
create policy "authorized update attendance" on public.attendance for update to authenticated using (public.is_attendance_user()) with check (public.is_attendance_user());
create policy "authorized delete attendance" on public.attendance for delete to authenticated using (public.is_attendance_user());
create policy "authorized read settings" on public.settings for select to authenticated using (public.is_attendance_user());
create policy "authorized insert settings" on public.settings for insert to authenticated with check (public.is_attendance_user());
create policy "authorized update settings" on public.settings for update to authenticated using (public.is_attendance_user()) with check (public.is_attendance_user());

insert into public.settings(class_name,semester_name,university_name,minimum_attendance,leave_calculation_policy)
values ('Electrical Engineering 2025','Semester 2','Your University',75,'exclude_leave');

-- After creating an Admin/CR in Authentication → Users, authorize them with:
-- insert into public.profiles(user_id,name,role)
-- values ('PASTE_AUTH_USER_UUID','Class Representative','cr');
