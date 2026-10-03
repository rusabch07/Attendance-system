-- READ ONLY. Run this PRE-RUN section with a trusted administrator in the
-- Supabase SQL Editor before applying 20261002070000_qa_integrity_guards.sql.
-- Every query is SELECT-only. Returned rows are diagnostic findings; this file
-- does not repair, delete, or rewrite data.

-- QA-30: a referenced timetable slot must belong to the exception's section.
-- A NULL schedule_slot_id is allowed by the existing schema for slotless breaks.
select
  e.id,
  e.exception_type,
  e.exception_date,
  e.section_id as exception_section_id,
  e.schedule_slot_id,
  t.section_id as slot_section_id
from public.schedule_exceptions e
left join public.timetable t on t.id = e.schedule_slot_id
where e.schedule_slot_id is not null
  and (t.id is null or t.section_id is distinct from e.section_id)
order by e.exception_date, e.id;

-- QA-31: leave section ownership must match the referenced student.
select
  v.id,
  v.student_id,
  v.section_id as leave_section_id,
  s.section_id as student_section_id,
  v.start_date,
  v.end_date
from public.student_leaves v
left join public.students s on s.id = v.student_id
where s.id is null or s.section_id is distinct from v.section_id
order by v.start_date, v.id;

-- QA-32: attendance may not combine a lecture and student from different sections.
select
  a.id,
  a.lecture_id,
  a.student_id,
  l.section_id as lecture_section_id,
  s.section_id as student_section_id
from public.attendance a
left join public.lectures l on l.id = a.lecture_id
left join public.students s on s.id = a.student_id
where l.id is null
   or s.id is null
   or l.section_id is distinct from s.section_id
order by a.id;

-- QA-33: these legacy CR rows would remain unvalidated after the NOT VALID
-- constraint is added. They are not rewritten by migration 070.
select
  p.id,
  p.user_id,
  p.role,
  p.section_id
from public.profiles p
left join public.sections s on s.id = p.section_id
where p.role = 'cr'
  and (p.section_id is null or s.id is null)
order by p.id;

-- QA-36: these CRs will lose scoped-data access immediately after 070 because
-- their assigned section is inactive. This is expected and does not alter rows.
select
  p.id,
  p.user_id,
  p.section_id,
  s.section_code,
  s.section_name
from public.profiles p
join public.sections s on s.id = p.section_id
where p.role = 'cr'
  and not s.is_active
order by s.section_code, p.id;

-- The migration also protects timetable-linked lectures. Review existing
-- section/subject ownership mismatches before applying it.
select
  l.id,
  l.schedule_slot_id,
  l.section_id as lecture_section_id,
  t.section_id as slot_section_id,
  l.subject_id as lecture_subject_id,
  t.subject_id as slot_subject_id
from public.lectures l
left join public.timetable t on t.id = l.schedule_slot_id
where l.schedule_slot_id is not null
  and (
    t.id is null
    or l.section_id is distinct from t.section_id
    or l.subject_id is distinct from t.subject_id
  )
order by l.lecture_date, l.id;

-- Review timetable-linked lectures that do not occur on their slot's weekday
-- and are not backed by a matching reschedule exception. Existing rows are not
-- changed; the trigger rechecks this only when the link/date is newly written.
select
  l.id,
  l.lecture_date,
  l.schedule_slot_id,
  t.day_of_week as slot_day_of_week
from public.lectures l
join public.timetable t on t.id = l.schedule_slot_id
where not exists (
  select 1
  from public.schedule_exceptions e
  where e.schedule_slot_id = l.schedule_slot_id
    and e.section_id = l.section_id
    and e.exception_type = 'rescheduled'
    and e.new_date = l.lecture_date
)
and (
  extract(isodow from l.lecture_date)::integer <> t.day_of_week
  or exists (
    select 1
    from public.schedule_exceptions e
    where e.schedule_slot_id = l.schedule_slot_id
      and e.section_id = l.section_id
      and e.exception_date = l.lecture_date
  )
)
order by l.lecture_date, l.id;

-- POST-RUN VERIFICATION. Run these SELECT-only queries after applying 070.

-- Expected result: four rows, each with enabled = 'O'.
with expected(table_name, trigger_name) as (
  values
    ('student_leaves', 'qa_leave_references'),
    ('schedule_exceptions', 'qa_exception_references'),
    ('attendance', 'qa_attendance_references'),
    ('lectures', 'qa_lecture_slot_references')
)
select
  e.table_name,
  e.trigger_name,
  t.tgenabled as enabled,
  pg_get_triggerdef(t.oid) as definition
from expected e
left join pg_class c
  on c.relname = e.table_name
 and c.relnamespace = 'public'::regnamespace
left join pg_trigger t
  on t.tgrelid = c.oid
 and t.tgname = e.trigger_name
 and not t.tgisinternal
order by e.table_name;

-- Expected result: seven rows. security_definer must be true and config must
-- contain the protected search_path.
with expected(function_signature) as (
  values
    ('public.is_attendance_user()'),
    ('public.current_section_id()'),
    ('public.current_academic_group_id()'),
    ('public.can_access_section(uuid)'),
    ('public.can_access_academic_group(uuid)'),
    ('public.can_access_attendance(uuid,uuid)'),
    ('public.qa_validate_references()')
)
select
  e.function_signature,
  p.oid::regprocedure::text as installed_signature,
  p.prosecdef as security_definer,
  p.provolatile as volatility,
  p.proconfig as config
from expected e
left join pg_proc p on p.oid = to_regprocedure(e.function_signature)
order by e.function_signature;

-- Expected result: seven rows. Anonymous and service-role direct execution
-- must be false. Authenticated execution is allowed only for the six RLS
-- access helpers; the trigger function is never called directly by API roles.
with expected(function_signature, authenticated_should_execute) as (
  values
    ('public.is_attendance_user()', true),
    ('public.current_section_id()', true),
    ('public.current_academic_group_id()', true),
    ('public.can_access_section(uuid)', true),
    ('public.can_access_academic_group(uuid)', true),
    ('public.can_access_attendance(uuid,uuid)', true),
    ('public.qa_validate_references()', false)
)
select
  e.function_signature,
  not has_function_privilege('anon', p.oid, 'EXECUTE') as anonymous_blocked,
  (
    has_function_privilege('authenticated', p.oid, 'EXECUTE')
    = e.authenticated_should_execute
  ) as authenticated_permission_correct,
  not has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_direct_call_blocked
from expected e
left join pg_proc p on p.oid = to_regprocedure(e.function_signature)
order by e.function_signature;

-- Expected result: one row, validated = false, with the CR-only NULL check.
select
  c.conname,
  c.convalidated as validated,
  pg_get_constraintdef(c.oid) as definition
from pg_constraint c
where c.conrelid = 'public.profiles'::regclass
  and c.conname = 'qa_cr_section_required';

-- Expected result: every expected policy reports installed = true.
with expected(table_name, policy_name) as (
  values
    ('academic_groups', 'academic groups read access'),
    ('academic_groups', 'admins manage academic groups'),
    ('sections', 'section users read own section'),
    ('sections', 'admins manage sections'),
    ('profiles', 'admins read all profiles'),
    ('profiles', 'admins update all profiles'),
    ('profiles', 'users read own profile'),
    ('profiles', 'users update own profile'),
    ('subjects', 'section users read group subjects'),
    ('subjects', 'admins manage subjects'),
    ('students', 'section scoped students'),
    ('timetable', 'section scoped timetable'),
    ('lectures', 'section scoped lectures'),
    ('student_leaves', 'section scoped student leaves'),
    ('settings', 'section scoped settings read'),
    ('settings', 'section scoped settings insert'),
    ('settings', 'section scoped settings update'),
    ('schedule_exceptions', 'section scoped schedule exceptions'),
    ('attendance', 'section scoped attendance')
)
select
  e.table_name,
  e.policy_name,
  (p.policyname is not null) as installed,
  p.cmd,
  p.qual,
  p.with_check
from expected e
left join pg_policies p
  on p.schemaname = 'public'
 and p.tablename = e.table_name
 and p.policyname = e.policy_name
order by e.table_name, e.policy_name;

-- Expected result: every table reports rls_enabled = true.
with expected(table_name) as (
  values
    ('academic_groups'),
    ('sections'),
    ('profiles'),
    ('subjects'),
    ('students'),
    ('timetable'),
    ('lectures'),
    ('student_leaves'),
    ('settings'),
    ('schedule_exceptions'),
    ('attendance')
)
select
  e.table_name,
  coalesce(c.relrowsecurity, false) as rls_enabled
from expected e
left join pg_class c
  on c.relname = e.table_name
 and c.relnamespace = 'public'::regnamespace
order by e.table_name;

-- Inspect the installed active-section logic without executing it as a user.
select
  p.oid::regprocedure::text as installed_signature,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in (
    'is_attendance_user',
    'current_section_id',
    'current_academic_group_id',
    'can_access_section',
    'can_access_academic_group',
    'can_access_attendance'
  )
order by p.proname;
