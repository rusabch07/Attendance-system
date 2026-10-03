-- R-01: save lecture metadata and attendance marks in one PostgreSQL transaction.
-- PostgreSQL functions execute atomically: any exception rolls back every write
-- made by this call, including a newly inserted or updated lecture row.
begin;

create or replace function public.save_attendance_transaction(
  p_lecture_id uuid,
  p_subject_id uuid,
  p_lecture_date date,
  p_lecture_number integer,
  p_section text,
  p_section_id uuid,
  p_schedule_slot_id uuid,
  p_attendance jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  saved_lecture public.lectures%rowtype;
  section_group_id uuid;
  subject_group_id uuid;
  attendance_row jsonb;
  attendance_row_count integer;
  distinct_student_count integer;
  valid_student_count integer;
  is_new_lecture boolean := p_lecture_id is null;
begin
  if auth.uid() is null or not public.is_attendance_user() then
    raise exception using
      errcode = '42501',
      message = 'An active attendance account is required';
  end if;

  if p_subject_id is null
     or p_lecture_date is null
     or p_lecture_number is null
     or p_lecture_number < 1
     or p_section_id is null
     or nullif(btrim(p_section), '') is null then
    raise exception using
      errcode = '22023',
      message = 'Complete valid lecture details are required';
  end if;

  if not coalesce(public.can_access_section(p_section_id), false) then
    raise exception using
      errcode = '42501',
      message = 'The requested section is unavailable for this account';
  end if;

  select s.academic_group_id
    into section_group_id
  from public.sections s
  where s.id = p_section_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'The requested section does not exist';
  end if;

  select s.academic_group_id
    into subject_group_id
  from public.subjects s
  where s.id = p_subject_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'The requested subject does not exist';
  end if;

  if subject_group_id is distinct from section_group_id then
    raise exception using
      errcode = '23514',
      message = 'The subject does not belong to the section academic group';
  end if;

  if p_attendance is null
     or jsonb_typeof(p_attendance) <> 'array'
     or jsonb_array_length(p_attendance) = 0 then
    raise exception using
      errcode = '22023',
      message = 'At least one attendance mark is required';
  end if;

  for attendance_row in
    select value from jsonb_array_elements(p_attendance)
  loop
    if jsonb_typeof(attendance_row) <> 'object'
       or nullif(attendance_row ->> 'student_id', '') is null
       or nullif(attendance_row ->> 'status', '') is null then
      raise exception using
        errcode = '22023',
        message = 'Each attendance mark requires a student and status';
    end if;

    -- Cast here so malformed identifiers fail before any lecture write.
    perform (attendance_row ->> 'student_id')::uuid;

    if attendance_row ->> 'status' not in ('present', 'absent', 'leave') then
      raise exception using
        errcode = '22023',
        message = 'Attendance status must be present, absent, or leave';
    end if;
  end loop;

  select
    count(*)::integer,
    count(distinct (value ->> 'student_id')::uuid)::integer
    into attendance_row_count, distinct_student_count
  from jsonb_array_elements(p_attendance);

  if attendance_row_count <> distinct_student_count then
    raise exception using
      errcode = '22023',
      message = 'Each student may appear only once in an attendance save';
  end if;

  select count(*)::integer
    into valid_student_count
  from jsonb_array_elements(p_attendance) mark
  join public.students s
    on s.id = (mark.value ->> 'student_id')::uuid
   and s.section_id = p_section_id;

  if valid_student_count <> attendance_row_count then
    raise exception using
      errcode = '23514',
      message = 'Every attendance student must belong to the lecture section';
  end if;

  if is_new_lecture then
    insert into public.lectures (
      subject_id,
      lecture_number,
      lecture_date,
      section,
      section_id,
      schedule_slot_id,
      created_by
    ) values (
      p_subject_id,
      p_lecture_number,
      p_lecture_date,
      btrim(p_section),
      p_section_id,
      p_schedule_slot_id,
      auth.uid()
    )
    returning * into saved_lecture;
  else
    -- Lock the existing lecture so concurrent edits serialize. RLS still
    -- applies because this function is SECURITY INVOKER.
    select *
      into saved_lecture
    from public.lectures
    where id = p_lecture_id
    for update;

    if not found then
      raise exception using
        errcode = 'P0002',
        message = 'The attendance record was not found or is unavailable';
    end if;

    update public.lectures
    set
      subject_id = p_subject_id,
      lecture_number = p_lecture_number,
      lecture_date = p_lecture_date,
      section = btrim(p_section),
      section_id = p_section_id,
      schedule_slot_id = p_schedule_slot_id,
      updated_at = now()
    where id = p_lecture_id
    returning * into saved_lecture;
  end if;

  insert into public.attendance (
    lecture_id,
    student_id,
    status,
    updated_at
  )
  select
    saved_lecture.id,
    (mark.value ->> 'student_id')::uuid,
    (mark.value ->> 'status')::public.attendance_status,
    now()
  from jsonb_array_elements(p_attendance) mark
  on conflict (lecture_id, student_id) do update
  set
    status = excluded.status,
    updated_at = excluded.updated_at;

  return to_jsonb(saved_lecture) || jsonb_build_object(
    'created', is_new_lecture,
    'attendance_count', attendance_row_count
  );
end;
$$;

-- Supabase may have explicit per-role default grants in addition to PUBLIC.
-- Only authenticated application users may call this SECURITY INVOKER RPC.
revoke all on function public.save_attendance_transaction(uuid, uuid, date, integer, text, uuid, uuid, jsonb) from public;
revoke all on function public.save_attendance_transaction(uuid, uuid, date, integer, text, uuid, uuid, jsonb) from anon, authenticated, service_role;
grant execute on function public.save_attendance_transaction(uuid, uuid, date, integer, text, uuid, uuid, jsonb) to authenticated;

commit;
