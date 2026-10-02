-- READ ONLY. Run with a trusted administrator in Supabase SQL Editor.
select 'attendance_section_mismatch' as issue, a.id::text as record_id
from public.attendance a left join public.lectures l on l.id=a.lecture_id
left join public.students s on s.id=a.student_id
where l.id is null or s.id is null or l.section_id is distinct from s.section_id
union all
select 'timetable_group_mismatch',t.id::text from public.timetable t
left join public.sections sec on sec.id=t.section_id left join public.subjects sub on sub.id=t.subject_id
where sec.id is null or sub.id is null or sec.academic_group_id is distinct from sub.academic_group_id
union all
select 'lecture_group_mismatch',l.id::text from public.lectures l
left join public.sections sec on sec.id=l.section_id left join public.subjects sub on sub.id=l.subject_id
where sec.id is null or sub.id is null or sec.academic_group_id is distinct from sub.academic_group_id
union all
select 'leave_section_mismatch',v.id::text from public.student_leaves v
left join public.students s on s.id=v.student_id where s.id is null or s.section_id is distinct from v.section_id
union all
select 'exception_section_mismatch',e.id::text from public.schedule_exceptions e
left join public.timetable t on t.id=e.schedule_slot_id where t.id is null or t.section_id is distinct from e.section_id
union all
select 'cr_section_missing',p.id::text from public.profiles p left join public.sections s on s.id=p.section_id
where p.role='cr' and (s.id is null or not s.is_active)
union all
select 'settings_section_missing',st.id::text from public.settings st left join public.sections s on s.id=st.section_id
where s.id is null
union all
select 'subject_group_missing',sub.id::text from public.subjects sub left join public.academic_groups g on g.id=sub.academic_group_id
where g.id is null;

select section_id,count(*) as settings_rows from public.settings group by section_id having count(*)>1;
-- Review legacy text/ID disagreement; never automatically remap historical records.
select st.id,st.section as legacy_section,s.section_name,s.section_code
from public.students st join public.sections s on s.id=st.section_id
where st.section not in (s.section_code,s.section_name,regexp_replace(s.section_name,'^Section\s+','','i'));
select section_id,subject_id,lecture_number,count(*) as reused_numbers
from public.lectures group by section_id,subject_id,lecture_number having count(*)>1;
select a.id as first_slot,b.id as second_slot from public.timetable a join public.timetable b
on a.id<b.id and a.section_id=b.section_id and a.day_of_week=b.day_of_week
and a.is_active and b.is_active and a.start_time<b.end_time and b.start_time<a.end_time;
