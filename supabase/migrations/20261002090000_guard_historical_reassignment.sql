-- R-03: block unsafe parent reassignment without rewriting existing records.
-- Run diagnostics/historical-reassignment.sql before and after deployment.
begin;

create or replace function public.guard_historical_ownership_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- The UPDATE already locks its parent row. Child writers take FOR SHARE below.
  -- A fixed transaction snapshot could miss a child committed after that snapshot,
  -- even after waiting for its lock. Ownership moves require a fresh snapshot;
  -- ordinary edits and assignments of the existing value are unaffected.
  if current_setting('transaction_isolation') not in ('read committed', 'read uncommitted') then
    raise exception using errcode = '23514',
      message = 'Ownership reassignment requires a READ COMMITTED transaction. Retry the change in a new transaction.';
  end if;

  if tg_table_name = 'students' then
    if exists (
      select 1 from public.attendance a
      left join public.lectures l on l.id = a.lecture_id
      where a.student_id = old.id
        and (l.id is null or l.section_id is distinct from new.section_id)
    ) then
      raise exception using errcode = '23514',
        message = 'Cannot move student to another section because attendance history exists in a different section.';
    end if;
    if exists (
      select 1 from public.student_leaves v
      where v.student_id = old.id and v.section_id is distinct from new.section_id
    ) then
      raise exception using errcode = '23514',
        message = 'Cannot move student to another section because leave records exist in a different section.';
    end if;

  elsif tg_table_name = 'subjects' then
    if exists (select 1 from public.timetable t where t.subject_id = old.id)
       or exists (select 1 from public.lectures l where l.subject_id = old.id) then
      raise exception using errcode = '23514',
        message = 'Cannot move subject to another academic group because timetable or lecture records reference it.';
    end if;

  elsif tg_table_name = 'sections' then
    if exists (
      select 1 from public.timetable t
      left join public.subjects s on s.id = t.subject_id
      where t.section_id = old.id
        and (s.id is null or s.academic_group_id is distinct from new.academic_group_id)
    ) or exists (
      select 1 from public.lectures l
      left join public.subjects s on s.id = l.subject_id
      where l.section_id = old.id
        and (s.id is null or s.academic_group_id is distinct from new.academic_group_id)
    ) then
      raise exception using errcode = '23514',
        message = 'Cannot move section to another academic group because timetable or lecture subjects belong to a different group.';
    end if;
    -- Slot-linked exceptions are covered by timetable; valid student attendance
    -- is covered by lectures. Slotless exceptions, students without history,
    -- leaves, settings and profiles have no independent academic-group key.
  end if;
  return new;
end
$$;
revoke all on function public.guard_historical_ownership_changes() from public, anon, authenticated, service_role;

create trigger guard_student_section_reassignment
  before update of section_id on public.students
  for each row when (old.section_id is distinct from new.section_id)
  execute function public.guard_historical_ownership_changes();

create trigger guard_subject_group_reassignment
  before update of academic_group_id on public.subjects
  for each row when (old.academic_group_id is distinct from new.academic_group_id)
  execute function public.guard_historical_ownership_changes();

create trigger guard_section_group_reassignment
  before update of academic_group_id on public.sections
  for each row when (old.academic_group_id is distinct from new.academic_group_id)
  execute function public.guard_historical_ownership_changes();

-- Serialize dependency creation/relinking with parent updates. FK KEY SHARE
-- locks alone do not conflict with updates of non-key ownership columns.
-- Run before the existing 040/070 validators, preserving their checks/errors.
create or replace function public.lock_historical_ownership_references()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_table_name in ('attendance', 'student_leaves') then
    perform 1 from public.students where id = new.student_id for share;
  elsif tg_table_name in ('timetable', 'lectures') then
    perform 1 from public.sections where id = new.section_id for share;
    perform 1 from public.subjects where id = new.subject_id for share;
  end if;
  return new;
end
$$;
revoke all on function public.lock_historical_ownership_references() from public, anon, authenticated, service_role;

create trigger a00_lock_attendance_ownership
  before insert or update of student_id, lecture_id on public.attendance
  for each row execute function public.lock_historical_ownership_references();
create trigger a00_lock_leave_ownership
  before insert or update of student_id, section_id on public.student_leaves
  for each row execute function public.lock_historical_ownership_references();
create trigger a00_lock_timetable_ownership
  before insert or update of section_id, subject_id on public.timetable
  for each row execute function public.lock_historical_ownership_references();
create trigger a00_lock_lecture_ownership
  before insert or update of section_id, subject_id on public.lectures
  for each row execute function public.lock_historical_ownership_references();

commit;
