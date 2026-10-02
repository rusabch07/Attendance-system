import {DB} from './supabase.js';
import {$,$$,esc,toast,modal,statusBadge} from './ui.js';
import {localDateKey,nextLectureNumber,shortTime} from './schedule.js';
import {attendanceStats} from './attendance-math.js';

const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
let data,selectedSubject='',selectedSection='',selectedDate=localDateKey(),lectureNo=1,statuses=new Map(),search='',editingId=null,selectedScheduleSlotId=null;

export async function render(initialData){
 data=initialData;
 selectedDate=localDateKey();
 selectedSubject='';
 selectedSection='';
 selectedScheduleSlotId=null;
 statuses=new Map();
 search='';
 const params=new URLSearchParams(location.search);
 editingId=params.get('edit');
 if(!editingId&&params.get('date'))selectedDate=params.get('date');
 let invalidSlot=false;

 if(editingId){
  const lecture=data.lectures.find(item=>item.id===editingId);
  if(lecture){
   selectedSubject=lecture.subject_id;
   selectedSection=lecture.section;
   selectedDate=lecture.lecture_date;
   lectureNo=lecture.lecture_number;
   selectedScheduleSlotId=lecture.schedule_slot_id||null;
   data.attendance.filter(item=>item.lecture_id===lecture.id).forEach(item=>statuses.set(item.student_id,item.status));
  }
 }else{
  const requestedSlot=params.get('slot');
  const slot=data.timetable.find(item=>item.id===requestedSlot&&item.is_active!==false&&data.subjects.some(subject=>subject.id===item.subject_id));
  if(slot){
   selectedScheduleSlotId=slot.id;
   selectedSubject=slot.subject_id;
   selectedSection=slot.section;
   selectedDate=localDateKey();
  }else if(data.subjects[0]){
   const requestedSubject=params.get('subject');
   selectedSubject=data.subjects.some(subject=>subject.id===requestedSubject)?requestedSubject:data.subjects[0].id;
   selectedSection=currentSubject()?.section||'';
   invalidSlot=Boolean(requestedSlot);
  }
  setNextLecture();
 }

 if(selectedScheduleSlotId&&!editingId){
  const existing=await DB.findScheduledLecture(selectedDate,selectedScheduleSlotId);
  if(existing){drawScheduledDuplicate(existing);return}
 }
 seedStatuses();
 draw();
 if(invalidSlot)toast('That timetable slot is unavailable. You can continue with manual attendance.','error');
}

function currentSubject(){return data.subjects.find(item=>item.id===selectedSubject)}
function currentScheduleSlot(){return data.timetable.find(item=>item.id===selectedScheduleSlotId)}
function classStudents(){return data.students.filter(student=>!selectedSection||student.section===selectedSection)}
function seedStatuses(force=false){classStudents().forEach(student=>{if(force||!statuses.has(student.id))statuses.set(student.id,'present')});if(!editingId)classStudents().forEach(student=>{if((data.leaves||[]).some(leave=>leave.student_id===student.id&&leave.status==='approved'&&leave.start_date<=selectedDate&&leave.end_date>=selectedDate))statuses.set(student.id,'leave')})}
function setNextLecture(){lectureNo=nextLectureNumber(data.lectures,selectedSubject)}

function slotLabel(slot){
 if(!slot)return 'Timetable slot';
 return `${DAYS[Number(slot.day_of_week)%7]} · ${shortTime(slot.start_time)}–${shortTime(slot.end_time)}`;
}

function draw(){
 const subject=currentSubject();
 const slot=currentScheduleSlot();
 const scheduled=Boolean(slot);
 const rows=classStudents().filter(student=>`${student.roll_no} ${student.name}`.toLowerCase().includes(search));
 const summary=attendanceStats(classStudents().map(student=>({status:statuses.get(student.id)||'present'})),data.settings?.leave_calculation_policy);
 const present=summary.present,absent=summary.absent,leave=summary.leave,percentage=summary.percentage;
 const backAction=editingId?`<a class="btn btn-outline" href="history.html${DB.qs}"><i class="bi bi-arrow-left"></i> Back to History</a>`:scheduled?`<a class="btn btn-outline" href="dashboard.html${DB.qs}"><i class="bi bi-arrow-left"></i> Today's Schedule</a>`:'';
 const context=scheduled?`<div class="notice schedule-context"><span class="schedule-context-icon"><i class="bi bi-calendar2-check-fill"></i></span><div><strong>Scheduled class</strong><span>${esc(slotLabel(slot))} · ${esc(slot.room||'Room not set')}</span></div><a href="attendance.html${DB.qs}" class="schedule-manual-link">Take manual attendance</a></div>`:'';
 $('#page').innerHTML=`<div class="page-heading"><div><h1>${editingId?'Edit Attendance':'Take Attendance'}</h1><p>${scheduled?'This class was opened from today’s timetable. Subject, section, date, and lecture number are prefilled.':editingId?'Update saved student statuses and lecture details.':'Everyone starts present — tap only the students who are absent.'}</p></div>${backAction}</div>${context}<div class="card toolbar"><div class="field"><label>Date</label><input id="date" class="input" type="date" value="${selectedDate}" ${scheduled?'disabled':''}></div><div class="field grow"><label>Subject</label><select id="subject" class="select" ${scheduled?'disabled':''}>${data.subjects.map(item=>`<option value="${item.id}" ${item.id===selectedSubject?'selected':''}>${esc(item.subject_name)} (${esc(item.subject_code)})</option>`).join('')}</select></div><div class="field"><label>Section</label><input class="input" value="${esc(selectedSection||'—')}" disabled></div>${scheduled?`<div class="field schedule-slot-field"><label>Timetable Slot</label><input class="input" value="${esc(shortTime(slot.start_time))}–${esc(shortTime(slot.end_time))}" disabled></div>`:''}<div class="field"><label>Lecture Number</label><input id="lectureNo" class="input" type="number" min="1" value="${lectureNo}" ${scheduled?'disabled':''}></div></div><div class="card toolbar"><button class="btn btn-success" id="allPresent"><i class="bi bi-check-circle"></i> Mark All Present</button><button class="btn btn-danger" id="allAbsent"><i class="bi bi-x-circle"></i> Mark All Absent</button><button class="btn btn-soft" id="copyPrevious"><i class="bi bi-copy"></i> Copy Previous Lecture</button><div class="field grow"><div class="searchbox"><i class="bi bi-search"></i><input class="input" id="searchStudent" value="${esc(search)}" placeholder="Search student…"></div></div><div class="count-strip"><span class="count-pill green">${present} Present</span><span class="count-pill red">${absent} Absent</span></div></div><div class="card table-card attendance-list"><div class="table-head"><h2>${esc(subject?.subject_name||'Select a subject')}</h2><span class="muted">${classStudents().length} students · Section ${esc(selectedSection||'—')}</span></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Present</th><th>Roll No</th><th>Student Name</th><th>Status</th></tr></thead><tbody>${rows.map(student=>{const status=statuses.get(student.id)||'present';return`<tr data-student="${student.id}" class="${status==='absent'?'absent-row':''}"><td><input class="attendance-check" type="checkbox" ${status==='present'?'checked':''} aria-label="Mark ${esc(student.name)} present"></td><td><strong>${esc(student.roll_no)}</strong></td><td>${esc(student.name)}</td><td>${statusBadge(status)}</td></tr>`}).join('')||`<tr><td colspan="4"><div class="empty"><i class="bi bi-person-x"></i>No students match this section and search.</div></td></tr>`}</tbody></table></div></div><div class="save-row"><button class="btn btn-primary btn-lg" id="saveAttendance"><i class="bi bi-floppy-fill"></i> ${editingId?'Update Attendance':'Save Attendance'}</button></div>`;
 const heading=$('.attendance-list thead tr');heading.cells[0].remove();heading.cells[2].textContent='Status (P / A / L)';$('.page-heading p').textContent=editingId?'Update saved student statuses and lecture details.':'Choose P for present, A for absent, or L for on leave.';
 $$('[data-student]').forEach(row=>{const status=statuses.get(row.dataset.student)||'present',studentName=row.cells[2].textContent;row.cells[0].remove();row.className=`${status}-row`;row.cells[2].innerHTML=`<div class="attendance-controls" role="group" aria-label="${esc(studentName)} attendance status">${[['present','P','Present'],['absent','A','Absent'],['leave','L','On Leave']].map(([value,label,title])=>`<button type="button" class="attendance-choice ${value} ${status===value?'selected':''}" data-status="${value}" aria-label="Mark ${esc(studentName)} ${title}" aria-pressed="${status===value}" title="${title}">${label}</button>`).join('')}</div>`});
 const leaveButton=document.createElement('button');leaveButton.className='btn btn-leave';leaveButton.id='allLeave';leaveButton.innerHTML='<i class="bi bi-calendar2-minus"></i> Mark All Leave';$('#allAbsent').after(leaveButton);
 $('.count-strip').innerHTML=`<span class="count-pill">Total Students: ${classStudents().length}</span><span class="count-pill green">${present} Present</span><span class="count-pill red">${absent} Absent</span><span class="count-pill amber">${leave} On Leave</span><span class="count-pill">Attendance: ${percentage}%</span>`;
 bind();
}

function bind(){
 $('#subject').onchange=event=>{selectedSubject=event.target.value;selectedSection=currentSubject()?.section||'';statuses.clear();setNextLecture();seedStatuses(true);draw()};
 $('#date').onchange=event=>{selectedDate=event.target.value;if(!editingId){statuses.clear();seedStatuses(true);draw()}};
 $('#lectureNo').onchange=event=>lectureNo=Number(event.target.value);
 $('#allPresent').onclick=()=>{classStudents().forEach(student=>statuses.set(student.id,'present'));draw()};
 $('#allAbsent').onclick=()=>{classStudents().forEach(student=>statuses.set(student.id,'absent'));draw()};
 $('#allLeave').onclick=()=>{classStudents().forEach(student=>statuses.set(student.id,'leave'));draw()};
 $('#copyPrevious').onclick=copyPrevious;
 let timer;
 $('#searchStudent').oninput=event=>{clearTimeout(timer);timer=setTimeout(()=>{search=event.target.value.toLowerCase();draw();$('#searchStudent').focus();$('#searchStudent').setSelectionRange(search.length,search.length)},100)};
 $$('[data-student]').forEach(row=>$$('[data-status]',row).forEach(button=>button.onclick=()=>{statuses.set(row.dataset.student,button.dataset.status);draw()}));
 $('#saveAttendance').onclick=save;
}

function copyPrevious(){
 const previous=data.lectures.filter(item=>item.subject_id===selectedSubject&&item.id!==editingId).sort((a,b)=>b.lecture_number-a.lecture_number)[0];
 if(!previous){toast('No previous lecture found for this subject.','error');return}
 data.attendance.filter(item=>item.lecture_id===previous.id).forEach(item=>statuses.set(item.student_id,item.status));
 draw();
 toast(`Copied statuses from Lecture ${previous.lecture_number}.`);
}

function drawScheduledDuplicate(lecture){
 const slot=data.timetable.find(item=>item.id===lecture.schedule_slot_id)||currentScheduleSlot();
 const subject=data.subjects.find(item=>item.id===lecture.subject_id)||currentSubject();
 $('#page').innerHTML=`<div class="page-heading"><div><h1>Attendance Taken</h1><p>This timetable entry already has an attendance record.</p></div><a class="btn btn-outline" href="dashboard.html${DB.qs}"><i class="bi bi-arrow-left"></i> Today's Schedule</a></div><div class="card card-pad duplicate-attendance-card"><div class="success-visual"><i class="bi bi-check-lg"></i></div><div class="modal-message"><h2>${esc(subject?.subject_name||'Scheduled class')}</h2><p>${esc(slotLabel(slot))} · Section ${esc(lecture.section)}<br>Saved as Lecture ${lecture.lecture_number}.</p></div><div class="duplicate-actions"><a class="btn btn-primary" href="history.html${DB.qs}#${encodeURIComponent(lecture.id)}"><i class="bi bi-eye"></i> View Attendance</a></div></div>`;
}

function duplicateModal(lecture){
 const m=modal({title:'Attendance already taken',small:true,body:'<p class="muted">This date and timetable slot already have an attendance record. No duplicate was created.</p>',actions:`<button class="btn btn-outline" data-cancel>Cancel</button><a class="btn btn-primary" href="history.html${DB.qs}#${encodeURIComponent(lecture.id)}">View Existing</a>`});
 $('[data-cancel]',m.el).onclick=m.close;
}

async function save(){
 if(!selectedSubject||!selectedSection||!selectedDate||!lectureNo||!classStudents().length){toast('Select a subject, date, lecture number, and make sure students are loaded.','error');return}
 if(selectedScheduleSlotId){
  const scheduledDuplicate=await DB.findScheduledLecture(selectedDate,selectedScheduleSlotId);
  if(scheduledDuplicate&&scheduledDuplicate.id!==editingId){duplicateModal(scheduledDuplicate);return}
 }
 const duplicate=await DB.findDuplicate(selectedSubject,selectedDate,lectureNo);
 if(!editingId&&duplicate){
  const m=modal({title:'Attendance already exists',small:true,body:`<p class="muted">Lecture ${lectureNo} for ${esc(currentSubject().subject_name)} already has attendance on this date.</p>`,actions:`<button class="btn btn-outline" data-cancel>Cancel</button><a class="btn btn-soft" href="history.html${DB.qs}#${duplicate.id}">View Existing</a><a class="btn btn-primary" href="attendance.html?${DB.demo?'demo=1&':''}edit=${duplicate.id}">Edit Existing</a>`});
  $('[data-cancel]',m.el).onclick=m.close;
  return;
 }
 const button=$('#saveAttendance');
 button.disabled=true;
 button.innerHTML='<i class="bi bi-arrow-repeat"></i> Saving…';
 try{
  const meta={subject_id:selectedSubject,lecture_date:selectedDate,lecture_number:Number(lectureNo),section:selectedSection,schedule_slot_id:selectedScheduleSlotId||null};
  const rows=classStudents().map(student=>({student_id:student.id,status:statuses.get(student.id)||'present'}));
  if(editingId)await DB.updateLecture(editingId,meta,rows);else await DB.saveLecture(meta,rows);
  const subject=currentSubject();
  const returnsToSchedule=Boolean(selectedScheduleSlotId&&!editingId);
  const m=modal({small:true,body:`<div class="success-visual"><i class="bi bi-check-lg"></i></div><div class="modal-message"><h2>Attendance ${editingId?'Updated':'Saved'}!</h2><p>Attendance for ${esc(subject.subject_name)}<br>Lecture ${lectureNo} has been ${editingId?'updated':'saved'} successfully.</p></div>`,actions:`<button class="btn btn-primary" data-ok style="min-width:160px">${returnsToSchedule?'Back to Today’s Schedule':'OK'}</button>`});
  const finish=()=>{m.close();location.href=returnsToSchedule?`dashboard.html${DB.qs}`:`history.html${DB.qs}`};
  $('[data-ok]',m.el).onclick=finish;
  $('.modal-close',m.el).onclick=finish;
 }catch(error){
  if(selectedScheduleSlotId&&error.code==='23505'){
   const existing=await DB.findScheduledLecture(selectedDate,selectedScheduleSlotId);
   if(existing){duplicateModal(existing);button.disabled=false;button.innerHTML=`<i class="bi bi-floppy-fill"></i> ${editingId?'Update Attendance':'Save Attendance'}`;return}
  }
  toast(error.message||'Unable to save attendance.','error');
  button.disabled=false;
  button.innerHTML=`<i class="bi bi-floppy-fill"></i> ${editingId?'Update Attendance':'Save Attendance'}`;
 }
}
