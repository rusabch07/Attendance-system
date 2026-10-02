-- QA guards for NEW writes. No records are deleted or rewritten.
-- Run diagnostics/qa-integrity.sql first; review results before applying.
begin;

-- Disabling a section must also deny an already-issued CR token, not only login UI.
create or replace function public.can_access_section(target_section_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select public.is_attendance_admin() or (
    public.is_attendance_user() and target_section_id = public.current_section_id()
    and exists (select 1 from public.sections where id = target_section_id and is_active)
  )
$$;
revoke all on function public.can_access_section(uuid) from public;
grant execute on function public.can_access_section(uuid) to authenticated;

create or replace function public.can_access_academic_group(target_academic_group_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select public.is_attendance_admin() or (
    public.is_attendance_user() and exists (
      select 1 from public.sections where id = public.current_section_id()
      and academic_group_id = target_academic_group_id and is_active
    )
  )
$$;
revoke all on function public.can_access_academic_group(uuid) from public;
grant execute on function public.can_access_academic_group(uuid) to authenticated;

-- Subject policy previously called current_academic_group_id directly.
drop policy if exists "section users read group subjects" on public.subjects;
create policy "section users read group subjects" on public.subjects
  for select to authenticated using (public.can_access_academic_group(academic_group_id));

create or replace function public.can_access_attendance(target_lecture_id uuid,target_student_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select public.is_attendance_admin() or (
    public.is_attendance_user() and exists (
      select 1 from public.lectures l join public.students s on s.id = target_student_id
      where l.id = target_lecture_id and l.section_id = s.section_id
      and l.section_id = public.current_section_id() and public.can_access_section(l.section_id)
    )
  )
$$;
revoke all on function public.can_access_attendance(uuid,uuid) from public;
grant execute on function public.can_access_attendance(uuid,uuid) to authenticated;

-- Admin profiles may be global; CR profiles must have an assigned section.
alter table public.profiles alter column section_id drop not null;
alter table public.profiles add constraint qa_cr_section_required
  check (role <> 'cr' or section_id is not null) not valid;

create or replace function public.qa_validate_references()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  reference_section uuid;
  reference_subject uuid;
  slot_day integer;
begin
  if tg_table_name = 'student_leaves' then
    select section_id into reference_section from public.students where id = new.student_id;
    if reference_section is distinct from new.section_id then
      raise exception 'Leave section must match its student';
    end if;
  elsif tg_table_name = 'schedule_exceptions' then
    select section_id into reference_section from public.timetable where id = new.schedule_slot_id;
    if reference_section is null or reference_section is distinct from new.section_id then
      raise exception 'Exception section must match an existing timetable slot';
    end if;
  elsif tg_table_name = 'attendance' then
    select section_id into reference_section from public.lectures where id = new.lecture_id;
    if reference_section is null or not exists (
      select 1 from public.students where id = new.student_id and section_id = reference_section
    ) then
      raise exception 'Attendance student and lecture must belong to the same section';
    end if;
  elsif tg_table_name = 'lectures' and new.schedule_slot_id is not null then
    select section_id,subject_id,day_of_week into reference_section,reference_subject,slot_day
      from public.timetable where id = new.schedule_slot_id;
    if reference_section is distinct from new.section_id or reference_subject is distinct from new.subject_id then
      raise exception 'Scheduled lecture must match its slot section and subject';
    end if;
    -- Already saved history remains editable; validate scheduling only for new instances.
    if tg_op = 'INSERT' or new.schedule_slot_id is distinct from old.schedule_slot_id
       or new.lecture_date is distinct from old.lecture_date then
      if not exists (select 1 from public.schedule_exceptions e where e.schedule_slot_id = new.schedule_slot_id
          and e.exception_type = 'rescheduled' and e.new_date = new.lecture_date) then
        if extract(isodow from new.lecture_date)::integer <> slot_day or exists (
          select 1 from public.schedule_exceptions e where e.schedule_slot_id = new.schedule_slot_id
          and e.exception_date = new.lecture_date
        ) then
          raise exception 'This slot does not take place on the requested date';
        end if;
      end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.qa_validate_references() from public;

create trigger qa_leave_references before insert or update on public.student_leaves
  for each row execute function public.qa_validate_references();
create trigger qa_exception_references before insert or update on public.schedule_exceptions
  for each row execute function public.qa_validate_references();
create trigger qa_attendance_references before insert or update on public.attendance
  for each row execute function public.qa_validate_references();
create trigger qa_lecture_slot_references before insert or update on public.lectures
  for each row execute function public.qa_validate_references();
commit;
