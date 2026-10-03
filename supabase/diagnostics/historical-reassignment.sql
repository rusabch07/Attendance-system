-- SELECT-only R-03 scan. Run as a trusted administrator so RLS cannot hide rows.
-- No automatic repairs: review any returned anomalies separately.
with anomalies as (
  select 'attendance_student_section' as issue, a.id as record_id
  from public.attendance a
  left join public.students s on s.id = a.student_id
  left join public.lectures l on l.id = a.lecture_id
  where s.id is null or l.id is null or s.section_id is distinct from l.section_id
  union all
  select 'leave_student_section', v.id
  from public.student_leaves v
  left join public.students s on s.id = v.student_id
  where s.id is null or s.section_id is distinct from v.section_id
  union all
  select 'timetable_subject_group', t.id
  from public.timetable t
  left join public.sections s on s.id = t.section_id
  left join public.subjects sub on sub.id = t.subject_id
  where s.id is null or sub.id is null or s.academic_group_id is distinct from sub.academic_group_id
  union all
  select 'lecture_subject_group', l.id
  from public.lectures l
  left join public.sections s on s.id = l.section_id
  left join public.subjects sub on sub.id = l.subject_id
  where s.id is null or sub.id is null or s.academic_group_id is distinct from sub.academic_group_id
  union all
  select 'exception_slot_section', e.id
  from public.schedule_exceptions e
  left join public.timetable t on t.id = e.schedule_slot_id
  where e.schedule_slot_id is not null and (t.id is null or e.section_id is distinct from t.section_id)
  union all
  select 'lecture_slot_ownership', l.id
  from public.lectures l
  left join public.timetable t on t.id = l.schedule_slot_id
  where l.schedule_slot_id is not null
    and (t.id is null or l.section_id is distinct from t.section_id or l.subject_id is distinct from t.subject_id)
)
select count(*) as anomaly_count,
  coalesce(jsonb_agg(to_jsonb(anomalies) order by issue, record_id), '[]'::jsonb) as anomalies
from anomalies;
