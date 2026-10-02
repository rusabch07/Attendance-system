create table if not exists public.student_leaves (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null
);

create index if not exists student_leaves_student_dates_idx
  on public.student_leaves(student_id, start_date, end_date);

alter table public.student_leaves enable row level security;

drop policy if exists "authorized read student leaves" on public.student_leaves;
create policy "authorized read student leaves" on public.student_leaves
  for select to authenticated using (public.is_attendance_user());
drop policy if exists "authorized insert student leaves" on public.student_leaves;
create policy "authorized insert student leaves" on public.student_leaves
  for insert to authenticated with check (public.is_attendance_user());
drop policy if exists "authorized update student leaves" on public.student_leaves;
create policy "authorized update student leaves" on public.student_leaves
  for update to authenticated using (public.is_attendance_user())
  with check (public.is_attendance_user());
drop policy if exists "authorized delete student leaves" on public.student_leaves;
create policy "authorized delete student leaves" on public.student_leaves
  for delete to authenticated using (public.is_attendance_user());