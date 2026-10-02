import {DB} from './supabase.js';
import {$,$$,esc,toast,modal,statusBadge} from './ui.js';
import {localDateKey,nextLectureNumber,shortTime,isSlotScheduledForDate,isValidDateKey} from './schedule.js';
import {attendanceStats,applyApprovedLeaves,attendanceRoster} from './attendance-math.js';
import {
  getCurrentUserContext,
  filterByActiveContext,
  setStoredAdminSection,
  renderAdminFilterBar
} from './access-context.js';

const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
let data,selectedSubject='',selectedSection='',selectedDate=localDateKey(),lectureNo=1,statuses=new Map(),search='',editingId=null,selectedScheduleSlotId=null,context;

export async function render(initialData){
 data=initialData;
 context=getCurrentUserContext(data);
 selectedDate=localDateKey();
 selectedSubject='';
 selectedSection='';
 selectedScheduleSlotId=null;
 statuses=new Map();
 search='';

 const params=new URLSearchParams(location.search);
 editingId=params.get('edit');
 const target = editingId ? data.lectures.find(item=>item.id===editingId) : data.timetable.find(item=>item.id===params.get('slot'));
 if(context.isAdmin&&target?.section_id){
  setStoredAdminSection(target.section_id);
  context=getCurrentUserContext(data);
  data.settings=(data.settings_rows||[]).find(s=>s.section_id===context.activeSectionId)||{};
 }
 data={...data,students:filterByActiveContext(data.students,context,data),lectures:filterByActiveContext(data.lectures,context,data),timetable:filterByActiveContext(data.timetable,context,data),subjects:data.subjects.filter(s=>s.academic_group_id===context.activeGroupId)};
 if((editingId&&!data.lectures.some(l=>l.id===editingId))||(params.get('slot')&&!data.timetable.some(s=>s.id===params.get('slot')))||(!context.isAdmin&&!context.activeSectionId)){
  $('#page').innerHTML='<div class="card card-pad"><h2>Attendance unavailable</h2><p>The requested record or section is unavailable for this account.</p></div>';
  return;
 }
 if(!editingId&&params.get('date'))selectedDate=params.get('date');
 let invalidSlot=false;

 // If Admin is in All Sections mode and hasn't selected a specific slot or edit or section parameter:
 if(context.isAdmin && context.isAllSections){
  drawAllSectionsBlockedView(data, context);
  return;
 }

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
   if(params.get('date'))selectedDate=params.get('date');else selectedDate=localDateKey();

   // Verify schedule exceptions for this slot
   const slotExceptions=data.schedule_exceptions||[];
   const directException=slotExceptions.find(ex=>ex.schedule_slot_id===slot.id&&ex.exception_date===selectedDate);
   if(directException){
    if(directException.exception_type==='cancelled'){
     drawCancelledException(slot,directException);
     return;
    }
    if(directException.exception_type==='break'){
     drawBreakException(slot,directException);
     return;
    }
    if(directException.exception_type==='rescheduled'&&directException.new_date!==selectedDate){
     drawRescheduledAwayException(slot,directException);
     return;
    }
   }
   if(!isSlotScheduledForDate(slot,slotExceptions,selectedDate)){
    $('#page').innerHTML='<div class="card card-pad"><h2>Attendance unavailable</h2><p>This timetable slot does not take place on the requested date.</p></div>';
    return;
   }
  }else{
   // Specific section mode or CR mode
   const secCode = context.activeSectionCode;
   selectedSection = secCode.startsWith('EE-') ? secCode.split('-').pop() : secCode;
   if(data.subjects[0]){
    const requestedSubject=params.get('subject');
    selectedSubject=data.subjects.some(subject=>subject.id===requestedSubject)?requestedSubject:data.subjects[0].id;
    invalidSlot=Boolean(requestedSlot);
   }
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

function drawAllSectionsBlockedView(appData, ctx){
 $('#page').innerHTML = `
  <div id="adminFilterMount"></div>
  <div class="page-heading">
   <div>
    <h1>Take Attendance</h1>
    <p>Attendance is recorded for one specific section.</p>
   </div>
  </div>
  <div class="card card-pad schedule-exception-blocked-card" style="max-width: 580px; margin: 30px auto; padding: 36px 30px; text-align: center;">
   <div class="amber-visual"><i class="bi bi-building-exclamation"></i></div>
   <div class="modal-message">
    <h2>Select a Section to Take Attendance</h2>
    <p style="margin: 12px auto 24px; max-width: 440px; color: var(--muted); line-height: 1.5;">
     Please select a specific section before taking attendance. Attendance cannot be taken while 'All Sections' is selected.
    </p>
   </div>
   <div style="display: grid; gap: 10px; max-width: 420px; margin: 0 auto;">
    ${ctx.availableSections.map(s => `
     <button class="btn btn-outline" style="justify-content: space-between; padding: 12px 18px; height: auto;" data-pick-sec="${esc(s.id)}">
      <span><strong>${esc(s.section_name)}</strong> <span class="muted">(${esc(s.section_code)})</span></span>
      <i class="bi bi-arrow-right"></i>
     </button>
    `).join('')}
   </div>
  </div>
 `;

 renderAdminFilterBar($('#adminFilterMount'), appData, async () => {
  const updated = await DB.all();
  render(updated);
 });

 $$('[data-pick-sec]').forEach(btn => {
  btn.onclick = async () => {
   setStoredAdminSection(btn.dataset.pickSec);
   const updated = await DB.all();
   render(updated);
  };
 });
}

function currentSubject(){return data.subjects.find(item=>item.id===selectedSubject)}
function currentScheduleSlot(){return data.timetable.find(item=>item.id===selectedScheduleSlotId)}

function classStudents(){
 return attendanceRoster(data.students,data.attendance,editingId).filter(student => {
  if (context?.isCR && context.activeSectionId && student.section_id) {
   return student.section_id === context.activeSectionId;
  }
  if (context?.isAdmin && !context.isAllSections && context.activeSectionId && student.section_id) {
   return student.section_id === context.activeSectionId;
  }
  if (selectedSection) {
   return student.section === selectedSection || student.section === selectedSection.split('-').pop();
  }
  return true;
 });
}

function seedStatuses(force=false){
 classStudents().forEach(student=>{if(force||!statuses.has(student.id))statuses.set(student.id,'present')});
 if(!editingId)applyApprovedLeaves(statuses,classStudents(),data.leaves,selectedDate);
}

function setNextLecture(){lectureNo=nextLectureNumber(data.lectures,selectedSubject,context.activeSectionId)}

function slotLabel(slot){
 if(!slot)return 'Timetable slot';
 return `${DAYS[Number(slot.day_of_week)%7]} · ${shortTime(slot.start_time)}–${shortTime(slot.end_time)}`;
}

function drawCancelledException(slot,exception){
 const subject=data.subjects.find(s=>s.id===slot.subject_id);
 $('#page').innerHTML=`<div class="page-heading"><div><h1>Class Cancelled</h1><p>This class is not taking place on this date.</p></div><a class="btn btn-outline" href="dashboard.html${DB.qs}"><i class="bi bi-arrow-left"></i> Today's Schedule</a></div><div class="card card-pad schedule-exception-blocked-card"><div class="danger-visual"><i class="bi bi-x-circle-fill"></i></div><div class="modal-message"><h2>${esc(subject?.subject_name||'Class')} was Cancelled</h2><p>${esc(slotLabel(slot))} · ${esc(selectedDate)}<br>${exception.reason?`<strong>Reason:</strong> ${esc(exception.reason)}`:'No reason provided.'}</p></div><div class="duplicate-actions" style="gap:10px"><a class="btn btn-outline" href="dashboard.html${DB.qs}">Back to Today's Schedule</a><a class="btn btn-soft" href="attendance.html${DB.qs}">Take Manual Attendance</a></div></div>`;
}

function drawBreakException(slot,exception){
 const subject=data.subjects.find(s=>s.id===slot.subject_id);
 $('#page').innerHTML=`<div class="page-heading"><div><h1>No Class / Break</h1><p>This scheduled class has been marked as No Class.</p></div><a class="btn btn-outline" href="dashboard.html${DB.qs}"><i class="bi bi-arrow-left"></i> Today's Schedule</a></div><div class="card card-pad schedule-exception-blocked-card"><div class="amber-visual"><i class="bi bi-pause-circle-fill"></i></div><div class="modal-message"><h2>No Class for ${esc(subject?.subject_name||'Subject')}</h2><p>${esc(slotLabel(slot))} · ${esc(selectedDate)}<br>${exception.reason?`<strong>Reason:</strong> ${esc(exception.reason)}`:'Marked as break or holiday.'}</p></div><div class="duplicate-actions" style="gap:10px"><a class="btn btn-outline" href="dashboard.html${DB.qs}">Back to Today's Schedule</a><a class="btn btn-soft" href="attendance.html${DB.qs}">Take Manual Attendance</a></div></div>`;
}

function drawRescheduledAwayException(slot,exception){
 const subject=data.subjects.find(s=>s.id===slot.subject_id);
 $('#page').innerHTML=`<div class="page-heading"><div><h1>Class Rescheduled</h1><p>Attendance must be taken on the new rescheduled date.</p></div><a class="btn btn-outline" href="dashboard.html${DB.qs}"><i class="bi bi-arrow-left"></i> Today's Schedule</a></div><div class="card card-pad schedule-exception-blocked-card"><div class="info-visual"><i class="bi bi-arrow-repeat"></i></div><div class="modal-message"><h2>${esc(subject?.subject_name||'Class')} Rescheduled</h2><p>This class originally scheduled for ${esc(selectedDate)} was moved to <strong>${esc(exception.new_date)} (${shortTime(exception.new_start_time)}–${shortTime(exception.new_end_time)})</strong>${exception.new_room?` · Room ${esc(exception.new_room)}`:''}.<br>${exception.reason?`<strong>Reason:</strong> ${esc(exception.reason)}`:''}</p></div><div class="duplicate-actions" style="gap:10px"><a class="btn btn-primary" href="attendance.html?${DB.demo?'demo=1&':''}slot=${slot.id}&date=${exception.new_date}&rescheduled=1"><i class="bi bi-calendar2-check"></i> Go to Rescheduled Class (${exception.new_date})</a><a class="btn btn-outline" href="dashboard.html${DB.qs}">Back to Today's Schedule</a></div></div>`;
}

function draw(){
 const subject=currentSubject();
 const slot=currentScheduleSlot();
 const scheduled=Boolean(slot);
 const slotExceptions=data.schedule_exceptions||[];
 const incomingRescheduled=slot?slotExceptions.find(ex=>ex.schedule_slot_id===slot.id&&ex.exception_type==='rescheduled'&&ex.new_date===selectedDate):null;

 const rows=classStudents().filter(student=>`${student.roll_no} ${student.name}`.toLowerCase().includes(search));
 const summary=attendanceStats(classStudents().map(student=>({status:statuses.get(student.id)||'present'})),data.settings?.leave_calculation_policy);
 const present=summary.present,absent=summary.absent,leave=summary.leave,percentage=summary.percentage;
 const backAction=editingId?`<a class="btn btn-outline" href="history.html${DB.qs}"><i class="bi bi-arrow-left"></i> Back to History</a>`:scheduled?`<a class="btn btn-outline" href="dashboard.html${DB.qs}"><i class="bi bi-arrow-left"></i> Today's Schedule</a>`:'';
 const contextNotice=scheduled?`<div class="notice schedule-context"><span class="schedule-context-icon"><i class="bi ${incomingRescheduled?'bi-arrow-repeat':'bi-calendar2-check-fill'}"></i></span><div><strong>${incomingRescheduled?'Rescheduled class':'Scheduled class'}</strong><span>${esc(slotLabel(slot))} · ${esc(incomingRescheduled?.new_room||slot.room||'Room not set')}${incomingRescheduled?` · Moved from ${esc(incomingRescheduled.exception_date)}`:''}</span></div><a href="attendance.html${DB.qs}" class="schedule-manual-link">Take manual attendance</a></div>`:'';

 $('#page').innerHTML=`
  <div id="adminFilterMount"></div>
  <div class="page-heading">
   <div>
    <h1>${editingId?'Edit Attendance':'Take Attendance'}</h1>
    <p>${scheduled?'This class was opened from today’s timetable. Subject, section, date, and lecture number are prefilled.':editingId?'Update saved student statuses and lecture details.':'Everyone starts present — tap only the students who are absent.'}</p>
   </div>
   ${backAction}
  </div>
  ${contextNotice}
  <div class="card toolbar">
   <div class="field"><label>Date</label><input id="date" class="input" type="date" value="${selectedDate}" ${scheduled?'disabled':''}></div>
   <div class="field grow"><label>Subject</label><select id="subject" class="select" ${scheduled?'disabled':''}>${data.subjects.map(item=>`<option value="${item.id}" ${item.id===selectedSubject?'selected':''}>${esc(item.subject_name)} (${esc(item.subject_code)})</option>`).join('')}</select></div>
   <div class="field"><label>Section</label><input class="input" value="${esc(selectedSection||'—')}" disabled></div>
   ${scheduled?`<div class="field schedule-slot-field"><label>Timetable Slot</label><input class="input" value="${esc(shortTime(incomingRescheduled?.new_start_time||slot.start_time))}–${esc(shortTime(incomingRescheduled?.new_end_time||slot.end_time))}" disabled></div>`:''}
   <div class="field"><label>Lecture Number</label><input id="lectureNo" class="input" type="number" min="1" value="${lectureNo}" ${scheduled?'disabled':''}></div>
  </div>
  <div class="card toolbar">
   <button class="btn btn-success" id="allPresent"><i class="bi bi-check-circle"></i> Mark All Present</button>
   <button class="btn btn-danger" id="allAbsent"><i class="bi bi-x-circle"></i> Mark All Absent</button>
   <button class="btn btn-soft" id="copyPrevious"><i class="bi bi-copy"></i> Copy Previous Lecture</button>
   <div class="field grow"><div class="searchbox"><i class="bi bi-search"></i><input class="input" id="searchStudent" value="${esc(search)}" placeholder="Search student…"></div></div>
   <div class="count-strip"><span class="count-pill green">${present} Present</span><span class="count-pill red">${absent} Absent</span></div>
  </div>
  <div class="card table-card attendance-list">
   <div class="table-head">
    <h2>${esc(subject?.subject_name||'Select a subject')}</h2>
    <span class="muted">${classStudents().length} students · Section ${esc(selectedSection||'—')}</span>
   </div>
   <div class="table-wrap">
    <table class="data-table">
     <thead><tr><th>Present</th><th>Roll No</th><th>Student Name</th><th>Status</th></tr></thead>
     <tbody>
      ${rows.map(student=>{const status=statuses.get(student.id)||'present';return`<tr data-student="${student.id}" class="${status==='absent'?'absent-row':''}"><td><input class="attendance-check" type="checkbox" ${status==='present'?'checked':''} aria-label="Mark ${esc(student.name)} present"></td><td><strong>${esc(student.roll_no)}</strong></td><td>${esc(student.name)}</td><td>${statusBadge(status)}</td></tr>`}).join('')||`<tr><td colspan="4"><div class="empty"><i class="bi bi-person-x"></i>No students match this section and search.</div></td></tr>`}
     </tbody>
    </table>
   </div>
  </div>
  <div class="save-row">
   <button class="btn btn-primary btn-lg" id="saveAttendance"><i class="bi bi-floppy-fill"></i> ${editingId?'Update Attendance':'Save Attendance'}</button>
  </div>
 `;

 if(context.isAdmin){
  renderAdminFilterBar($('#adminFilterMount'), data, async ()=>{
   const updated = await DB.all();
   render(updated);
  });
 }

 const heading=$('.attendance-list thead tr');
 heading.cells[0].remove();
 heading.cells[2].textContent='Status (P / A / L)';
 $('.page-heading p').textContent=editingId?'Update saved student statuses and lecture details.':'Choose P for present, A for absent, or L for on leave.';
 $$('[data-student]').forEach(row=>{
  const status=statuses.get(row.dataset.student)||'present',studentName=row.cells[2].textContent;
  row.cells[0].remove();
  row.className=`${status}-row`;
  row.cells[2].innerHTML=`<div class="attendance-controls" role="group" aria-label="${esc(studentName)} attendance status">${[['present','P','Present'],['absent','A','Absent'],['leave','L','On Leave']].map(([value,label,title])=>`<button type="button" class="attendance-choice ${value} ${status===value?'selected':''}" data-status="${value}" aria-label="Mark ${esc(studentName)} ${title}" aria-pressed="${status===value}" title="${title}">${label}</button>`).join('')}</div>`;
 });
 const leaveButton=document.createElement('button');
 leaveButton.className='btn btn-leave';
 leaveButton.id='allLeave';
 leaveButton.innerHTML='<i class="bi bi-calendar2-minus"></i> Mark All Leave';
 $('#allAbsent').after(leaveButton);
 $('.count-strip').innerHTML=`<span class="count-pill">Total Students: ${classStudents().length}</span><span class="count-pill green">${present} Present</span><span class="count-pill red">${absent} Absent</span><span class="count-pill amber">${leave} On Leave</span><span class="count-pill">Attendance: ${percentage}%</span>`;
 bind();
}

function bind(){
 $('#subject').onchange=event=>{selectedSubject=event.target.value;statuses.clear();setNextLecture();seedStatuses(true);draw()};
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
 const previous=data.lectures.filter(item=>item.subject_id===selectedSubject&&item.id!==editingId&&item.section_id===context.activeSectionId&&item.lecture_date<=selectedDate).sort((a,b)=>b.lecture_number-a.lecture_number)[0];
 if(!previous){toast('No previous lecture found for this subject and section.','error');return}
 data.attendance.filter(item=>item.lecture_id===previous.id).forEach(item=>statuses.set(item.student_id,item.status));
 seedStatuses();
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
 try{await saveValidated()}catch(error){toast(error.message||'Unable to save attendance.','error');const button=$('#saveAttendance');if(button){button.disabled=false;button.innerHTML=`<i class="bi bi-floppy-fill"></i> ${editingId?'Update Attendance':'Save Attendance'}`;}}
}

async function saveValidated(){
 if(!selectedSubject||!selectedSection||!isValidDateKey(selectedDate)||!Number.isInteger(lectureNo)||lectureNo<1||!classStudents().length){toast('Select a subject, valid date, positive integer lecture number, and make sure students are loaded.','error');return}
 if(selectedScheduleSlotId){
  const slotExceptions=data.schedule_exceptions||[];
  const exception=slotExceptions.find(ex=>ex.schedule_slot_id===selectedScheduleSlotId&&ex.exception_date===selectedDate);
  if(exception){
   if(exception.exception_type==='cancelled'||exception.exception_type==='break'){
    toast('Cannot save attendance for a cancelled or break class.','error');
    return;
   }
   if(exception.exception_type==='rescheduled'&&exception.new_date!==selectedDate){
    toast(`This class was rescheduled to ${exception.new_date}. Take attendance on the rescheduled date.`,'error');
    return;
   }
  }
  const scheduledDuplicate=await DB.findScheduledLecture(selectedDate,selectedScheduleSlotId);
  if(scheduledDuplicate&&scheduledDuplicate.id!==editingId){duplicateModal(scheduledDuplicate);return}
 }
 const secId = context?.activeSectionId || data.sections?.find(s => s.section_code === selectedSection || s.section_name === `Section ${selectedSection}`)?.id || null;
 const duplicate=await DB.findDuplicate(selectedSubject,selectedDate,lectureNo,secId);
 if(!editingId&&duplicate){
  const m=modal({title:'Attendance already exists',small:true,body:`<p class="muted">Lecture ${lectureNo} for ${esc(currentSubject().subject_name)} Section ${esc(selectedSection)} already has attendance on this date.</p>`,actions:`<button class="btn btn-outline" data-cancel>Cancel</button><a class="btn btn-soft" href="history.html${DB.qs}#${duplicate.id}">View Existing</a><a class="btn btn-primary" href="attendance.html?${DB.demo?'demo=1&':''}edit=${duplicate.id}">Edit Existing</a>`});
  $('[data-cancel]',m.el).onclick=m.close;
  return;
 }
 const button=$('#saveAttendance');
 button.disabled=true;
 button.innerHTML='<i class="bi bi-arrow-repeat"></i> Saving…';
 try{
  const meta={
   subject_id:selectedSubject,
   lecture_date:selectedDate,
   lecture_number:Number(lectureNo),
   section:selectedSection,
   section_id:secId,
   schedule_slot_id:selectedScheduleSlotId||null
  };
  const rows=classStudents().map(student=>({student_id:student.id,status:statuses.get(student.id)||'present'}));
  if(editingId)await DB.updateLecture(editingId,meta,rows);else await DB.saveLecture(meta,rows);
  const subject=currentSubject();
  const returnsToSchedule=Boolean(selectedScheduleSlotId&&!editingId);
  const m=modal({small:true,body:`<div class="success-visual"><i class="bi bi-check-lg"></i></div><div class="modal-message"><h2>Attendance ${editingId?'Updated':'Saved'}!</h2><p>Attendance for ${esc(subject.subject_name)}<br>Lecture ${lectureNo} (Section ${esc(selectedSection)}) has been ${editingId?'updated':'saved'} successfully.</p></div>`,actions:`<button class="btn btn-primary" data-ok style="min-width:160px">${returnsToSchedule?'Back to Today’s Schedule':'OK'}</button>`});
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
