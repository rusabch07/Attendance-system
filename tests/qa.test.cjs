// No dependencies. Run: node --experimental-vm-modules --test tests/qa.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const storage=()=>{const values=new Map();return{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)}};
async function runtime(shared={}){
 const downloads=[];
 const context=vm.createContext({URLSearchParams,URL,crypto,structuredClone,console,Date,setTimeout,clearTimeout,location:{search:'?demo=1',hash:''},window:{},sessionStorage:shared.sessionStorage||storage(),localStorage:shared.localStorage||storage(),document:{querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>({click(){}})},Blob});
 const cache=new Map();
 function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const mod=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file});cache.set(file,mod);return mod;}
 const entry=load(path.join(root,'js/supabase.js'));
 await entry.link((specifier,referencing)=>load(path.resolve(path.dirname(referencing.identifier),specifier)));
 await entry.evaluate();
 async function module(name){const mod=load(path.join(root,'js',name));if(mod.status==='unlinked')await mod.link((specifier,referencing)=>load(path.resolve(path.dirname(referencing.identifier),specifier)));if(mod.status==='linked')await mod.evaluate();return mod.namespace;}
 return {DB:entry.namespace.DB,context,module,downloads};
}
test('percentages: empty, P/A/L, both policies, leave only',async()=>{
 const r=await runtime(),{attendanceStats}=await r.module('attendance-math.js');
 assert.equal(attendanceStats([]).percentage,0);
 assert.equal(attendanceStats({present:3,absent:1,leave:2}).percentage,75);
 assert.equal(attendanceStats({present:3,absent:1,leave:2},'count_leave_as_absent').percentage,50);
 assert.equal(attendanceStats([{status:'leave'}]).percentage,0);
});
test('lecture numbering counts saved attendance in the selected section only',async()=>{
 const r=await runtime(),{nextLectureNumber}=await r.module('schedule.js');
 assert.equal(nextLectureNumber([{subject_id:'s',section_id:'A',lecture_number:5},{subject_id:'s',section_id:'B',lecture_number:12}],'s','A'),6);
 assert.equal(nextLectureNumber([],'s','A'),1);
});
test('copying prior statuses preserves current approved leave, inclusively',async()=>{
 const r=await runtime(),{applyApprovedLeaves}=await r.module('attendance-math.js');
 const statuses=new Map([['a','absent'],['b','present'],['c','present']]);
 const leaves=[{student_id:'a',status:'approved',start_date:'2026-10-05',end_date:'2026-10-06'},{student_id:'b',status:'pending',start_date:'2026-10-05',end_date:'2026-10-06'}];
 applyApprovedLeaves(statuses,[{id:'a'},{id:'b'},{id:'c'}],leaves,'2026-10-06');
 assert.equal(statuses.get('a'),'leave');assert.equal(statuses.get('b'),'present');assert.equal(statuses.get('c'),'present');
});
test('remaining classes excludes past/current/taken and existing exceptions',async()=>{
 const r=await runtime(),{remainingScheduleItems,isSlotScheduledForDate}=await r.module('schedule.js');
 assert.equal(remainingScheduleItems([{status:'awaiting'},{status:'current'},{status:'taken',lecture:{}},{status:'upcoming',exception:{}},{status:'upcoming'}]).length,1);
 const slot={id:'t',day_of_week:1,is_active:true};
 assert.equal(isSlotScheduledForDate(slot,[],'2026-10-05'),true);
 assert.equal(isSlotScheduledForDate(slot,[],'2026-10-06'),false);
 assert.equal(isSlotScheduledForDate(slot,[],'2026-02-31'),false);
 assert.equal(isSlotScheduledForDate(slot,[{schedule_slot_id:'t',exception_date:'2026-10-05',exception_type:'cancelled'}],'2026-10-05'),false);
 assert.equal(isSlotScheduledForDate(slot,[{schedule_slot_id:'t',exception_date:'2026-10-05',exception_type:'rescheduled',new_date:'2026-10-05'}],'2026-10-05'),true);
});
test('editing historical attendance cannot invent marks for new roster additions',async()=>{
 const r=await runtime(),{attendanceRoster}=await r.module('attendance-math.js');
 const students=[{id:'old'},{id:'new'}],marks=[{lecture_id:'lecture',student_id:'old',status:'absent'}];
 assert.equal(attendanceRoster(students,marks,'lecture').length,1);
 assert.equal(attendanceRoster(students,marks,'lecture')[0].id,'old');
 assert.equal(attendanceRoster(students,marks).length,2);
});
test('another academic group resets invalid section context and isolates rows',async()=>{
 const r=await runtime(),c=await r.module('access-context.js'),data=await r.DB.all();
 data.academic_groups.push({id:'ag-other',department:'QA',batch:'2026',semester:'3'});
 data.sections.push({id:'sec-other',academic_group_id:'ag-other',section_code:'QA-26-A',section_name:'Section A'});
 r.context.sessionStorage.setItem('attendance_admin_group_filter','ag-other');
 r.context.sessionStorage.setItem('attendance_admin_section_filter','sec-1');
 const context=c.getCurrentUserContext(data);assert.equal(context.isAllSections,true);assert.equal(context.availableSections.length,1);
 assert.equal(c.filterByActiveContext([...data.students,{id:'qa',section_id:'sec-other'}],context,data).length,1);
});
test('schedule boundaries, cancellation, break, reschedule and next week',async()=>{
 const r=await runtime(),s=await r.module('schedule.js');
 const slot={id:'t',subject_id:'s',section_id:'A',day_of_week:1,start_time:'09:00',end_time:'10:00',is_active:true};
 const now=new Date(2026,9,5,9,30),data={timetable:[slot],subjects:[{id:'s'}],lectures:[],schedule_exceptions:[]};
 assert.equal(s.scheduleStatus(slot,new Date(2026,9,5,8,59)),'upcoming');
 assert.equal(s.scheduleStatus(slot,now),'current');
 assert.equal(s.scheduleStatus(slot,new Date(2026,9,5,10)),'awaiting');
 assert.equal(s.scheduleStatus(slot,now,true),'completed');
 for(const type of ['cancelled','break','rescheduled']){
  data.schedule_exceptions=[{id:'e',schedule_slot_id:'t',section_id:'A',exception_date:'2026-10-05',exception_type:type,new_date:'2026-10-06',new_start_time:'11:00',new_end_time:'12:00'}];
  assert.equal(s.resolveTodayScheduleItems(data,now)[0].status,type);
  assert.equal(s.resolveTodayScheduleItems(data,new Date(2026,9,12,9,30))[0].status,'current');
 }
 const moved=s.resolveTodayScheduleItems(data,new Date(2026,9,6,11,30));
 assert.equal(moved.length,1);assert.equal(moved[0].isRescheduled,true);assert.equal(moved[0].status,'current');
 data.lectures=[{schedule_slot_id:'t',lecture_date:'2026-10-06'}];
 assert.equal(s.resolveTodayScheduleItems(data,new Date(2026,9,6,12,30))[0].status,'taken');
});
test('role context rejects unknown CR assignment and ignores forged admin filters',async()=>{
 const r=await runtime(),c=await r.module('access-context.js'),data=await r.DB.all();
 r.context.sessionStorage.setItem('attendance_admin_section_filter','sec-2');
 data.profile={role:'cr',section_id:'sec-1'};
 let context=c.getCurrentUserContext(data);
 assert.equal(context.activeSectionId,'sec-1');assert.equal(c.filterByActiveContext(data.students,context,data).length,8);
 data.profile.section_id='unknown';context=c.getCurrentUserContext(data);
 assert.equal(context.activeSectionId,null);assert.equal(c.filterByActiveContext(data.students,context,data).length,0);
 data.profile={role:'admin'};r.context.sessionStorage.setItem('attendance_admin_section_filter','invalid');
 assert.equal(c.getCurrentUserContext(data).isAllSections,true);
 const unknown=[{section_id:'other'},{section:'OTHER'},{}];
 assert.equal(c.filterByActiveContext(unknown,c.getCurrentUserContext(data),data).length,0);
});
test('demo CRUD persists through navigation/refresh and rejects duplicates',async()=>{
 const shared={sessionStorage:storage(),localStorage:storage()},r=await runtime(shared);
 const row={name:'QA Student',roll_no:'QA-0001',registration_no:'QA',section:'A',section_id:'sec-1',semester:'2'};
 const student=await r.DB.addStudent(row);await assert.rejects(r.DB.addStudent(row));
 await r.DB.updateStudent(student.id,{name:'QA Updated'});
 const refreshed=await runtime(shared);
 assert.equal((await refreshed.DB.all()).students.find(s=>s.id===student.id).name,'QA Updated');
 await refreshed.DB.deleteStudent(student.id);assert.equal((await refreshed.DB.all()).students.some(s=>s.id===student.id),false);
});
test('demo CR restrictions, role mismatch, normalized login and logout',async()=>{
 const r=await runtime();await r.DB.signIn(' ee-25-b ','demo','cr');
 assert.equal((await r.DB.all()).profile.section_id,'sec-2');
 await assert.rejects(r.DB.signIn('admin@university.edu','demo','cr'));
 await assert.rejects(r.DB.signIn('EE-25-A','demo','admin'));
 await assert.rejects(r.DB.addSubject({subject_code:'QA',academic_group_id:'ag-1'}));
 await assert.rejects(r.DB.updateStudent('stu-1',{name:'forged'}));
 await assert.rejects(r.DB.signIn('unknown','demo','cr'));
 await assert.rejects(r.DB.signIn('','demo','cr'));
 await assert.rejects(r.DB.signIn('EE-25-A','','cr'));
 await r.DB.signOut();assert.equal(await r.DB.session(),null);
});
test('scheduled and manual duplicate prevention and attendance ownership',async()=>{
 const r=await runtime(),meta={subject_id:'sub-1',section_id:'sec-1',section:'A',lecture_number:10,lecture_date:'2026-10-05',schedule_slot_id:'slot-1'};
 const rows=[{student_id:'stu-1',status:'present'}];
 const lecture=await r.DB.saveLecture(meta,rows);
 assert.equal((await r.DB.findScheduledLecture(meta.lecture_date,'slot-1')).id,lecture.id);
 await assert.rejects(r.DB.saveLecture({...meta,lecture_number:11},rows));
 await assert.rejects(r.DB.saveLecture({...meta,schedule_slot_id:null},rows));
 await assert.rejects(r.DB.saveLecture({...meta,lecture_number:12,schedule_slot_id:null},[{student_id:'stu-9',status:'present'}]));
 await r.DB.updateLecture(lecture.id,meta,[{student_id:'stu-1',status:'leave'}]);
 assert.equal((await r.DB.all()).attendance.find(a=>a.lecture_id===lecture.id).status,'leave');
 await r.DB.deleteLecture(lecture.id);assert.equal((await r.DB.all()).attendance.some(a=>a.lecture_id===lecture.id),false);
});
test('failed new attendance save leaves lecture and mark counts unchanged',async()=>{
 const r=await runtime(),before=await r.DB.all();
 const lectureCount=before.lectures.length,attendanceCount=before.attendance.length;
 const meta={subject_id:'sub-1',section_id:'sec-1',section:'A',lecture_number:200,lecture_date:'2031-01-10',schedule_slot_id:null};
 await assert.rejects(r.DB.saveLecture(meta,[{student_id:'stu-1',status:'present'},{student_id:'stu-9',status:'absent'}]));
 const after=await r.DB.all();
 assert.equal(after.lectures.length,lectureCount);
 assert.equal(after.attendance.length,attendanceCount);
 assert.equal(after.lectures.some(l=>l.subject_id===meta.subject_id&&l.lecture_number===meta.lecture_number),false);
});
test('failed historical attendance edit changes neither metadata nor marks',async()=>{
 const r=await runtime();
 const meta={subject_id:'sub-1',section_id:'sec-1',section:'A',lecture_number:201,lecture_date:'2031-01-11',schedule_slot_id:null};
 const lecture=await r.DB.saveLecture(meta,[{student_id:'stu-1',status:'present'},{student_id:'stu-2',status:'absent'}]);
 const original=(await r.DB.all()),originalLecture=structuredClone(original.lectures.find(l=>l.id===lecture.id));
 const originalMarks=structuredClone(original.attendance.filter(a=>a.lecture_id===lecture.id).sort((a,b)=>a.student_id.localeCompare(b.student_id)));
 await assert.rejects(r.DB.updateLecture(lecture.id,{...meta,lecture_number:202},[{student_id:'stu-1',status:'leave'},{student_id:'stu-9',status:'present'}]));
 const after=await r.DB.all();
 assert.deepEqual(after.lectures.find(l=>l.id===lecture.id),originalLecture);
 assert.deepEqual(after.attendance.filter(a=>a.lecture_id===lecture.id).sort((a,b)=>a.student_id.localeCompare(b.student_id)),originalMarks);
});
test('successful attendance save commits lecture and every P A L mark',async()=>{
 const r=await runtime(),before=await r.DB.all();
 const meta={subject_id:'sub-1',section_id:'sec-1',section:'A',lecture_number:203,lecture_date:'2031-01-12',schedule_slot_id:null};
 const rows=[{student_id:'stu-1',status:'present'},{student_id:'stu-2',status:'absent'},{student_id:'stu-3',status:'leave'}];
 const lecture=await r.DB.saveLecture(meta,rows),after=await r.DB.all();
 assert.equal(after.lectures.length,before.lectures.length+1);
 assert.equal(after.attendance.length,before.attendance.length+3);
 assert.deepEqual(after.attendance.filter(a=>a.lecture_id===lecture.id).map(a=>a.status).sort(),['absent','leave','present']);
});
test('leave creation/approval/rejection and reference checks',async()=>{
 const r=await runtime(),row={student_id:'stu-1',section_id:'sec-1',start_date:'2026-10-05',end_date:'2026-10-06',reason:'QA'};
 const leave=await r.DB.addLeave(row);assert.equal(leave.status,'pending');
 await r.DB.updateLeaveStatus(leave.id,'approved');assert.equal((await r.DB.all()).leaves.find(l=>l.id===leave.id).status,'approved');
 await r.DB.updateLeaveStatus(leave.id,'rejected');assert.equal((await r.DB.all()).leaves.find(l=>l.id===leave.id).status,'rejected');
 await assert.rejects(r.DB.addLeave({...row,section_id:'sec-2'}));
});
test('exception upsert/revert, inactive slots, group-specific subject uniqueness',async()=>{
 const r=await runtime(),row={schedule_slot_id:'slot-1',section_id:'sec-1',exception_date:'2026-10-05',exception_type:'cancelled',reason:'QA'};
 await r.DB.addScheduleException(row);const ex=await r.DB.addScheduleException({...row,reason:'Updated'});
 assert.equal((await r.DB.all()).schedule_exceptions.filter(e=>e.schedule_slot_id==='slot-1').length,1);
 await r.DB.deleteScheduleException(ex.id);assert.equal((await r.DB.all()).schedule_exceptions.length,0);
 await assert.rejects(r.DB.addScheduleException({...row,section_id:'sec-2'}));
 const slot=await r.DB.addTimetableSlot({section_id:'sec-1',subject_id:'sub-1',is_active:false});assert.equal(slot.is_active,false);
 await r.DB.addSubject({subject_code:'EE-302',academic_group_id:'ag-other'});
 await assert.rejects(r.DB.addSubject({subject_code:'EE-302',academic_group_id:'ag-1'}));
 await assert.rejects(r.DB.addTimetableSlot({section_id:'sec-1',subject_id:(await r.DB.all()).subjects.find(s=>s.academic_group_id==='ag-other').id}));
});
test('section settings persist and never alter the other section',async()=>{
 const r=await runtime();await assert.rejects(r.DB.saveSettings({minimum_attendance:80}));
 r.context.sessionStorage.setItem('attendance_admin_section_filter','sec-1');
 await r.DB.saveSettings({minimum_attendance:80});assert.equal((await r.DB.all()).settings.minimum_attendance,80);
 r.context.sessionStorage.setItem('attendance_admin_section_filter','sec-2');assert.equal((await r.DB.all()).settings.minimum_attendance,75);
});
test('blank identity fields and impossible manual lecture dates are rejected',async()=>{
 const r=await runtime();
 await assert.rejects(r.DB.addStudent({name:'   ',roll_no:'QA',registration_no:'QA',semester:'2',section_id:'sec-1'}));
 await assert.rejects(r.DB.saveLecture({subject_id:'sub-1',section_id:'sec-1',section:'A',lecture_number:10,lecture_date:'2026-02-31'},[]));
});
test('CSV is raw rows with BOM, quoting and explicit summary opt-in',async()=>{
 const r=await runtime();let blob;
 r.context.URL={createObjectURL:value=>{blob=value;return 'blob:test'},revokeObjectURL(){}};
 const {exportTableCsv}=await r.module('export-utils.js');
 exportTableCsv('QA',[{Name:'A, "B"',Note:'line\nnext',Status:'Leave'}]);
 const bytes=await blob.arrayBuffer(),raw=Buffer.from(bytes);
 assert.equal(raw.subarray(0,3).toString('hex'),'efbbbf');
 const csv=raw.toString('utf8');assert.ok(csv.includes('"A, ""B"""'));assert.ok(csv.includes('"line\nnext"'));assert.equal(csv.includes('SUMMARY'),false);
 exportTableCsv('QA',[{Status:'Present'}],{showSummary:true});assert.ok((await blob.text()).includes('SUMMARY'));
});
test('all JavaScript modules parse and local HTML asset links exist',()=>{
 for(const file of fs.readdirSync(path.join(root,'js')).filter(f=>f.endsWith('.js')))new vm.SourceTextModule(fs.readFileSync(path.join(root,'js',file),'utf8'));
 for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.html'))){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  for(const match of html.matchAll(/(?:src|href)="([^"?#]+)(?:[?#][^"]*)?"/g))if(!/^(https?:|#)/.test(match[1]))assert.ok(fs.existsSync(path.join(root,match[1])),`${file}: ${match[1]}`);
 }
});
