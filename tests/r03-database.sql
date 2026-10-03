-- Disposable integration suite: run after migration 090 in Supabase SQL Editor
-- as postgres. All fixtures, test helpers, and successful test edits roll back.
begin isolation level read committed;

create temporary table r03_results(test text, result text) on commit drop;
grant all on r03_results to authenticated;
create function pg_temp.r03_assert(label text, ok boolean) returns void
language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'R-03 assertion failed: %', label; end if;
  insert into r03_results values (label, 'PASS');
end $$;
create function pg_temp.r03_reject(label text, command text, code text, fragment text) returns void
language plpgsql as $$
begin
  begin
    execute command;
  exception when others then
    if sqlstate = code and position(fragment in sqlerrm) > 0 then
      insert into r03_results values (label, 'PASS');
      return;
    end if;
    raise;
  end;
  raise exception 'R-03 expected rejection: %', label;
end $$;

-- Capture every existing business row, not just counts. No existing row is used
-- as a fixture. The reserved IDs must be unused; duplicate PKs abort the suite.
create function pg_temp.r03_snapshot() returns jsonb language sql as $$
 select jsonb_build_object(
  'students',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.students t),
  'subjects',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.subjects t),
  'sections',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.sections t),
  'lectures',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.lectures t),
  'attendance',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.attendance t),
  'timetable',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.timetable t),
  'leaves',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.student_leaves t),
  'exceptions',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.schedule_exceptions t),
  'settings',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.settings t),
  'profiles',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.profiles t),
  'groups',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]') from public.academic_groups t))
$$;

insert into auth.users(id,email) values
 ('93000000-0000-0000-0000-000000000001','r03-admin@example.invalid'),
 ('93000000-0000-0000-0000-000000000002','r03-cr@example.invalid');
insert into public.academic_groups(id,department,batch,semester) values
 ('93000000-0000-0000-0000-000000000010','R03 QA G1','R03','1'),
 ('93000000-0000-0000-0000-000000000020','R03 QA G2','R03','1');
insert into public.sections(id,academic_group_id,section_name,section_code,department,batch,semester) values
 ('93000000-0000-0000-0000-000000000011','93000000-0000-0000-0000-000000000010','R03 A','R03-A','R03','R03','1'),
 ('93000000-0000-0000-0000-000000000012','93000000-0000-0000-0000-000000000010','R03 B','R03-B','R03','R03','1'),
 ('93000000-0000-0000-0000-000000000013','93000000-0000-0000-0000-000000000010','R03 Empty','R03-EMPTY','R03','R03','1'),
 ('93000000-0000-0000-0000-000000000014','93000000-0000-0000-0000-000000000010','R03 Independent','R03-INDEPENDENT','R03','R03','1');
insert into public.profiles(user_id,name,role,section_id) values
 ('93000000-0000-0000-0000-000000000001','R03 Admin','admin',null),
 ('93000000-0000-0000-0000-000000000002','R03 CR','cr','93000000-0000-0000-0000-000000000011');
insert into public.students(id,roll_no,registration_no,name,section,semester,section_id) values
 ('93000000-0000-0000-0000-000000000101','R03-HISTORY','R03','R03 History','A','1','93000000-0000-0000-0000-000000000011'),
 ('93000000-0000-0000-0000-000000000102','R03-FREE','R03','R03 Free','A','1','93000000-0000-0000-0000-000000000011'),
 ('93000000-0000-0000-0000-000000000103','R03-LEAVE','R03','R03 Leave','A','1','93000000-0000-0000-0000-000000000011'),
 ('93000000-0000-0000-0000-000000000104','R03-INDEPENDENT','R03','R03 Independent','I','1','93000000-0000-0000-0000-000000000014'),
 ('93000000-0000-0000-0000-000000000105','R03-CR-FREE','R03','R03 CR Free','A','1','93000000-0000-0000-0000-000000000011');
insert into public.subjects(id,subject_name,subject_code,teacher_name,semester,section,academic_group_id) values
 ('93000000-0000-0000-0000-000000000201','R03 Timetable','R03-TT','QA','1','Shared','93000000-0000-0000-0000-000000000010'),
 ('93000000-0000-0000-0000-000000000202','R03 Lecture','R03-LECTURE','QA','1','Shared','93000000-0000-0000-0000-000000000010'),
 ('93000000-0000-0000-0000-000000000203','R03 Free','R03-FREE','QA','1','Shared','93000000-0000-0000-0000-000000000010');
insert into public.timetable(id,subject_id,section_id,section,day_of_week,start_time,end_time) values
 ('93000000-0000-0000-0000-000000000301','93000000-0000-0000-0000-000000000201','93000000-0000-0000-0000-000000000011','A',1,'09:00','10:00');
insert into public.lectures(id,subject_id,section_id,section,lecture_number,lecture_date,created_by) values
 ('93000000-0000-0000-0000-000000000401','93000000-0000-0000-0000-000000000202','93000000-0000-0000-0000-000000000011','A',1,'2026-10-05','93000000-0000-0000-0000-000000000001'),
 ('93000000-0000-0000-0000-000000000402','93000000-0000-0000-0000-000000000202','93000000-0000-0000-0000-000000000012','B',1,'2026-10-05','93000000-0000-0000-0000-000000000001');
insert into public.attendance(lecture_id,student_id,status) values
 ('93000000-0000-0000-0000-000000000401','93000000-0000-0000-0000-000000000101','present');
insert into public.student_leaves(student_id,section_id,start_date,end_date,reason) values
 ('93000000-0000-0000-0000-000000000103','93000000-0000-0000-0000-000000000011','2026-10-05','2026-10-06','R03 QA'),
 ('93000000-0000-0000-0000-000000000104','93000000-0000-0000-0000-000000000014','2026-10-05','2026-10-06','R03 QA');
insert into public.settings(section_id) values ('93000000-0000-0000-0000-000000000014');
insert into public.schedule_exceptions(section_id,schedule_slot_id,exception_date,exception_type) values
 ('93000000-0000-0000-0000-000000000011','93000000-0000-0000-0000-000000000301','2026-10-12','cancelled'),
 ('93000000-0000-0000-0000-000000000014',null,'2026-10-12','break');

create temporary table r03_before as select pg_temp.r03_snapshot() as data;
grant select on r03_before to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','93000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"93000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select pg_temp.r03_assert('authenticated Admin identity',current_user='authenticated' and public.is_attendance_admin());

select pg_temp.r03_reject('A student with attendance', $$update public.students set section_id='93000000-0000-0000-0000-000000000012' where id='93000000-0000-0000-0000-000000000101'$$,'23514','attendance history');
select pg_temp.r03_reject('C student with leave', $$update public.students set section_id='93000000-0000-0000-0000-000000000012' where id='93000000-0000-0000-0000-000000000103'$$,'23514','leave records');
select pg_temp.r03_reject('D subject with timetable only', $$update public.subjects set academic_group_id='93000000-0000-0000-0000-000000000020' where id='93000000-0000-0000-0000-000000000201'$$,'23514','timetable or lecture');
select pg_temp.r03_reject('D subject with lecture only', $$update public.subjects set academic_group_id='93000000-0000-0000-0000-000000000020' where id='93000000-0000-0000-0000-000000000202'$$,'23514','timetable or lecture');
select pg_temp.r03_reject('F section with timetable and history', $$update public.sections set academic_group_id='93000000-0000-0000-0000-000000000020' where id='93000000-0000-0000-0000-000000000011'$$,'23514','subjects belong');
select pg_temp.r03_reject('F section with lecture only', $$update public.sections set academic_group_id='93000000-0000-0000-0000-000000000020' where id='93000000-0000-0000-0000-000000000012'$$,'23514','subjects belong');
select pg_temp.r03_assert('failed Admin moves leave all rows exactly unchanged',pg_temp.r03_snapshot()=(select data from r03_before));

update public.students set section_id='93000000-0000-0000-0000-000000000012', section='B' where id='93000000-0000-0000-0000-000000000102';
select pg_temp.r03_assert('B student without history moves',(select section_id='93000000-0000-0000-0000-000000000012' from public.students where id='93000000-0000-0000-0000-000000000102'));
update public.subjects set academic_group_id='93000000-0000-0000-0000-000000000020' where id='93000000-0000-0000-0000-000000000203';
select pg_temp.r03_assert('E unused subject moves',(select academic_group_id='93000000-0000-0000-0000-000000000020' from public.subjects where id='93000000-0000-0000-0000-000000000203'));
update public.sections set academic_group_id='93000000-0000-0000-0000-000000000020' where id='93000000-0000-0000-0000-000000000013';
select pg_temp.r03_assert('G empty section moves',(select academic_group_id='93000000-0000-0000-0000-000000000020' from public.sections where id='93000000-0000-0000-0000-000000000013'));
update public.sections set academic_group_id='93000000-0000-0000-0000-000000000020' where id='93000000-0000-0000-0000-000000000014';
select pg_temp.r03_assert('independent students leaves settings slotless breaks do not overblock',(select academic_group_id='93000000-0000-0000-0000-000000000020' from public.sections where id='93000000-0000-0000-0000-000000000014'));

update public.students set name='R03 Renamed',roll_no='R03-RENAMED',email='qa@example.invalid',phone='000',section_id=section_id where id='93000000-0000-0000-0000-000000000101';
update public.subjects set subject_name='R03 Renamed',subject_code='R03-RENAMED',academic_group_id=academic_group_id where id='93000000-0000-0000-0000-000000000201';
update public.sections set section_name='R03 Renamed',section_code='R03-RENAMED',login_id='R03-RENAMED',academic_group_id=academic_group_id where id='93000000-0000-0000-0000-000000000011';
select pg_temp.r03_assert('normal edits and unchanged ownership values succeed',
 (select name='R03 Renamed' from public.students where id='93000000-0000-0000-0000-000000000101') and
 (select subject_name='R03 Renamed' from public.subjects where id='93000000-0000-0000-0000-000000000201') and
 (select section_name='R03 Renamed' from public.sections where id='93000000-0000-0000-0000-000000000011'));
select pg_temp.r03_assert('safe moves and normal edits do not rewrite history',
 (pg_temp.r03_snapshot()-'students'-'subjects'-'sections')=(select data-'students'-'subjects'-'sections' from r03_before));

select pg_temp.r03_reject('070 cross-section attendance', $$insert into public.attendance(lecture_id,student_id,status) values ('93000000-0000-0000-0000-000000000401','93000000-0000-0000-0000-000000000102','present')$$,'23514','same section');
select pg_temp.r03_reject('070 leave ownership', $$insert into public.student_leaves(student_id,section_id,start_date,end_date,reason) values ('93000000-0000-0000-0000-000000000101','93000000-0000-0000-0000-000000000012','2026-10-05','2026-10-06','R03')$$,'23514','Leave section');
select pg_temp.r03_reject('070 exception ownership', $$insert into public.schedule_exceptions(section_id,schedule_slot_id,exception_date,exception_type) values ('93000000-0000-0000-0000-000000000012','93000000-0000-0000-0000-000000000301','2026-10-19','cancelled')$$,'23514','Exception section');

-- The deployed 080 RPC must continue to commit valid marks and reject invalid
-- saves without changing lecture metadata or attendance.
select public.save_attendance_transaction('93000000-0000-0000-0000-000000000401','93000000-0000-0000-0000-000000000202','2026-10-05',1,'A','93000000-0000-0000-0000-000000000011',null,'[{"student_id":"93000000-0000-0000-0000-000000000101","status":"leave"}]');
select pg_temp.r03_assert('080 valid atomic save',(select status='leave' from public.attendance where lecture_id='93000000-0000-0000-0000-000000000401' and student_id='93000000-0000-0000-0000-000000000101'));
reset role;
create temporary table r03_rpc_before as select pg_temp.r03_snapshot() as data;
grant select on r03_rpc_before to authenticated;
set local role authenticated;
select pg_temp.r03_reject('080 invalid edit is rejected', $$select public.save_attendance_transaction('93000000-0000-0000-0000-000000000401','93000000-0000-0000-0000-000000000202','2026-10-06',2,'A','93000000-0000-0000-0000-000000000011',null,'[{"student_id":"93000000-0000-0000-0000-000000000102","status":"present"}]')$$,'23514','Every attendance student');
select pg_temp.r03_assert('080 failed save leaves every row unchanged',pg_temp.r03_snapshot()=(select data from r03_rpc_before));

-- CR: exercise RLS with actual authenticated role and a synthetic CR profile.
select set_config('request.jwt.claim.sub','93000000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"93000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select pg_temp.r03_assert('authenticated CR identity',current_user='authenticated' and not public.is_attendance_admin() and public.is_attendance_user());
select pg_temp.r03_reject('CR cannot move a dependency-free student outside section', $$update public.students set section_id='93000000-0000-0000-0000-000000000012' where id='93000000-0000-0000-0000-000000000105'$$,'42501','row-level security');
select pg_temp.r03_reject('CR cannot transfer own student outside section', $$update public.students set section_id='93000000-0000-0000-0000-000000000012' where id='93000000-0000-0000-0000-000000000103'$$,'23514','leave records');
-- Subject and section UPDATE policies hide rows from CR rather than raising.
with changed as (update public.subjects set academic_group_id='93000000-0000-0000-0000-000000000020' where id='93000000-0000-0000-0000-000000000201' returning id)
select pg_temp.r03_assert('CR cannot reassign subjects',not exists(select 1 from changed));
with changed as (update public.sections set academic_group_id='93000000-0000-0000-0000-000000000020' where id='93000000-0000-0000-0000-000000000011' returning id)
select pg_temp.r03_assert('CR cannot reassign sections',not exists(select 1 from changed));
with changed as (update public.students set section_id='93000000-0000-0000-0000-000000000011' where id='93000000-0000-0000-0000-000000000102' returning id)
select pg_temp.r03_assert('CR cannot take student from another section',not exists(select 1 from changed));
reset role;
update public.sections set is_active=false where id='93000000-0000-0000-0000-000000000011';
set local role authenticated;
select pg_temp.r03_assert('070 inactive CR loses access',not public.is_attendance_user() and not public.can_access_section('93000000-0000-0000-0000-000000000011'));

reset role;
select test,result from r03_results order by test;
rollback;
