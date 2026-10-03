-- QA guards for future writes. No records are deleted, rewritten, or remapped.
-- Run diagnostics/qa-integrity.sql first and review every returned row.
begin;

-- An inactive section invalidates CR access even when the CR still has a valid
-- Supabase session. Admin profiles remain valid with or without a section.
create or replace function public.is_attendance_user()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    left join public.sections s on s.id = p.section_id
    where p.user_id = auth.uid()
      and (
        p.role = 'admin'
        or (p.role = 'cr' and s.is_active)
      )
  )
$$;
revoke all on function public.is_attendance_user() from public;
revoke all on function public.is_attendance_user() from anon, authenticated, service_role;
grant execute on function public.is_attendance_user() to authenticated;

create or replace function public.current_section_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.section_id
  from public.profiles p
  left join public.sections s on s.id = p.section_id
  where p.user_id = auth.uid()
    and (
      p.role = 'admin'
      or (p.role = 'cr' and s.is_active)
    )
  limit 1
$$;
revoke all on function public.current_section_id() from public;
revoke all on function public.current_section_id() from anon, authenticated, service_role;
grant execute on function public.current_section_id() to authenticated;

create or replace function public.current_academic_group_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.academic_group_id
  from public.profiles p
  join public.sections s on s.id = p.section_id
  where p.user_id = auth.uid()
    and (
      p.role = 'admin'
      or (p.role = 'cr' and s.is_active)
    )
  limit 1
$$;
revoke all on function public.current_academic_group_id() from public;
revoke all on function public.current_academic_group_id() from anon, authenticated, service_role;
grant execute on function public.current_academic_group_id() to authenticated;

create or replace function public.can_access_section(target_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_attendance_admin()
    or (
      public.is_attendance_user()
      and target_section_id = public.current_section_id()
      and exists (
        select 1
        from public.sections s
        where s.id = target_section_id
          and s.is_active
      )
    )
$$;
revoke all on function public.can_access_section(uuid) from public;
revoke all on function public.can_access_section(uuid) from anon, authenticated, service_role;
grant execute on function public.can_access_section(uuid) to authenticated;

create or replace function public.can_access_academic_group(target_academic_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_attendance_admin()
    or (
      public.is_attendance_user()
      and target_academic_group_id = public.current_academic_group_id()
      and exists (
        select 1
        from public.sections s
        where s.id = public.current_section_id()
          and s.academic_group_id = target_academic_group_id
          and s.is_active
      )
    )
$$;
revoke all on function public.can_access_academic_group(uuid) from public;
revoke all on function public.can_access_academic_group(uuid) from anon, authenticated, service_role;
grant execute on function public.can_access_academic_group(uuid) to authenticated;

-- The subject policy previously compared against current_academic_group_id()
-- directly, so replace it with the active-section-aware helper.
drop policy if exists "section users read group subjects" on public.subjects;
create policy "section users read group subjects" on public.subjects
  for select to authenticated
  using (public.can_access_academic_group(academic_group_id));

create or replace function public.can_access_attendance(
  target_lecture_id uuid,
  target_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_attendance_admin()
    or (
      public.is_attendance_user()
      and exists (
        select 1
        from public.lectures l
        join public.students s on s.id = target_student_id
        where l.id = target_lecture_id
          and l.section_id = s.section_id
          and l.section_id = public.current_section_id()
          and public.can_access_section(l.section_id)
      )
    )
$$;
revoke all on function public.can_access_attendance(uuid, uuid) from public;
revoke all on function public.can_access_attendance(uuid, uuid) from anon, authenticated, service_role;
grant execute on function public.can_access_attendance(uuid, uuid) to authenticated;

-- Admin profiles may be global. The NOT VALID check leaves unknown legacy rows
-- untouched, but PostgreSQL still enforces it for every new or updated row.
alter table public.profiles
  alter column section_id drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'qa_cr_section_required'
  ) then
    alter table public.profiles
      add constraint qa_cr_section_required
      check (role <> 'cr' or section_id is not null)
      not valid;
  end if;
end
$$;

-- These ownership checks are triggers rather than RLS-only checks so they also
-- apply to Admin writes. SECURITY DEFINER lets the checks read referenced rows
-- without being hidden by RLS; the fixed search_path prevents object shadowing.
create or replace function public.qa_validate_references()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  reference_section uuid;
  reference_subject uuid;
  slot_day integer;
begin
  if tg_table_name = 'student_leaves' then
    select s.section_id
      into reference_section
    from public.students s
    where s.id = new.student_id;

    if not found or reference_section is distinct from new.section_id then
      raise exception using
        errcode = '23514',
        message = 'Leave section must match its student';
    end if;

  elsif tg_table_name = 'schedule_exceptions' then
    -- schedule_slot_id is intentionally nullable for existing slotless break
    -- behavior. When a slot is referenced, ownership must match its section.
    if new.schedule_slot_id is not null then
      select t.section_id
        into reference_section
      from public.timetable t
      where t.id = new.schedule_slot_id;

      if not found or reference_section is distinct from new.section_id then
        raise exception using
          errcode = '23514',
          message = 'Exception section must match its timetable slot';
      end if;
    end if;

  elsif tg_table_name = 'attendance' then
    select l.section_id
      into reference_section
    from public.lectures l
    where l.id = new.lecture_id;

    if not found or not exists (
      select 1
      from public.students s
      where s.id = new.student_id
        and s.section_id = reference_section
    ) then
      raise exception using
        errcode = '23514',
        message = 'Attendance student and lecture must belong to the same section';
    end if;

  elsif tg_table_name = 'lectures' and new.schedule_slot_id is not null then
    select t.section_id, t.subject_id, t.day_of_week
      into reference_section, reference_subject, slot_day
    from public.timetable t
    where t.id = new.schedule_slot_id;

    if not found
       or reference_section is distinct from new.section_id
       or reference_subject is distinct from new.subject_id then
      raise exception using
        errcode = '23514',
        message = 'Scheduled lecture must match its timetable slot section and subject';
    end if;

    -- Already saved history remains untouched. Scheduling is rechecked only
    -- for a new link or when its slot/date changes.
    if tg_op = 'INSERT'
       or new.schedule_slot_id is distinct from old.schedule_slot_id
       or new.lecture_date is distinct from old.lecture_date then
      if not exists (
        select 1
        from public.schedule_exceptions e
        where e.schedule_slot_id = new.schedule_slot_id
          and e.section_id = new.section_id
          and e.exception_type = 'rescheduled'
          and e.new_date = new.lecture_date
      ) then
        if extract(isodow from new.lecture_date)::integer <> slot_day
           or exists (
             select 1
             from public.schedule_exceptions e
             where e.schedule_slot_id = new.schedule_slot_id
               and e.section_id = new.section_id
               and e.exception_date = new.lecture_date
           ) then
          raise exception using
            errcode = '23514',
            message = 'This timetable slot does not take place on the requested date';
        end if;
      end if;
    end if;
  end if;

  return new;
end
$$;
revoke all on function public.qa_validate_references() from public;
revoke all on function public.qa_validate_references() from anon, authenticated, service_role;

drop trigger if exists qa_leave_references on public.student_leaves;
create trigger qa_leave_references
  before insert or update on public.student_leaves
  for each row execute function public.qa_validate_references();

drop trigger if exists qa_exception_references on public.schedule_exceptions;
create trigger qa_exception_references
  before insert or update on public.schedule_exceptions
  for each row execute function public.qa_validate_references();

drop trigger if exists qa_attendance_references on public.attendance;
create trigger qa_attendance_references
  before insert or update on public.attendance
  for each row execute function public.qa_validate_references();

drop trigger if exists qa_lecture_slot_references on public.lectures;
create trigger qa_lecture_slot_references
  before insert or update on public.lectures
  for each row execute function public.qa_validate_references();

commit;
