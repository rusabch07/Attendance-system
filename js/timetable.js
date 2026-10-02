import {DB} from './supabase.js';
import {$,$$,esc,toast,modal,confirmBox} from './ui.js';
import {shortTime,nextDateForWeekday,localDateKey} from './schedule.js';

const DAYS=['','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
let data;

export async function render(initialData){
 data=initialData;
 draw();
}

function sortedSlots(){
 return [...data.timetable].sort((a,b)=>Number(a.day_of_week)-Number(b.day_of_week)||String(a.start_time).localeCompare(String(b.start_time))||String(a.end_time).localeCompare(String(b.end_time)));
}

function subjectFor(id){
 return data.subjects.find(subject=>subject.id===id);
}

function draw(){
 const slots=sortedSlots();
 const rows=[];
 for(let day=1;day<=7;day++){
  const daySlots=slots.filter(slot=>Number(slot.day_of_week)===day);
  if(!daySlots.length){
   rows.push(`<tr class="timetable-empty-row"><td><strong>${DAYS[day]}</strong></td><td colspan="6"><span class="muted">No classes scheduled</span></td></tr>`);
   continue;
  }
  daySlots.forEach(slot=>{
   const subject=subjectFor(slot.subject_id);
   const slotExceptions=(data.schedule_exceptions||[]).filter(ex=>ex.schedule_slot_id===slot.id);
   const exceptionBadge=slotExceptions.length?`<span class="schedule-exception-badge ${slotExceptions[0].exception_type}" style="margin-left:6px" title="${slotExceptions.length} active exception(s)">${slotExceptions.length===1?slotExceptions[0].exception_type:`${slotExceptions.length} exceptions`}</span>`:'';
   rows.push(`<tr class="${slot.is_active===false?'inactive-slot':''}"><td><strong>${DAYS[day]}</strong>${slot.is_active===false?'<span class="inactive-label">Inactive</span>':''}${exceptionBadge}</td><td class="timetable-time"><strong>${shortTime(slot.start_time)}</strong><span class="mobile-time-end">–${shortTime(slot.end_time)}</span></td><td class="timetable-end">${shortTime(slot.end_time)}</td><td><span class="timetable-subject">${esc(subject?.subject_name||'Unknown subject')}</span><small>${esc(subject?.subject_code||'')}</small></td><td class="timetable-section">${esc(slot.section)}</td><td class="timetable-room">${esc(slot.room||'—')}</td><td><div class="actions"><button class="btn-icon" data-exception="${slot.id}" title="Schedule Exception (Cancel / Break / Reschedule)" aria-label="Schedule exception for ${esc(subject?.subject_name||'timetable slot')}"><i class="bi bi-calendar2-x"></i></button><button class="btn-icon" data-edit="${slot.id}" title="Edit slot" aria-label="Edit ${esc(subject?.subject_name||'timetable slot')}"><i class="bi bi-pencil"></i></button><button class="btn-icon danger" data-delete="${slot.id}" title="Delete slot" aria-label="Delete ${esc(subject?.subject_name||'timetable slot')}"><i class="bi bi-trash"></i></button></div></td></tr>`);
  });
 }
 $('#page').innerHTML=`<div class="page-heading"><div><h1>Class Timetable</h1><p>Manage the weekly recurring class schedule used on your dashboard.</p></div><button class="btn btn-primary" id="addSlot"><i class="bi bi-plus-lg"></i> Add Time Slot</button></div><div class="card table-card"><div class="table-head"><div><h2>Weekly Schedule</h2><span class="muted timetable-count">${slots.filter(slot=>slot.is_active!==false).length} active ${slots.filter(slot=>slot.is_active!==false).length===1?'slot':'slots'}</span></div><span class="muted"><i class="bi bi-clock"></i> Device local time</span></div><div class="table-wrap"><table class="data-table timetable-table"><thead><tr><th>Day</th><th>Start Time</th><th>End Time</th><th>Subject</th><th>Section</th><th>Room</th><th>Actions</th></tr></thead><tbody>${rows.join('')}</tbody></table></div></div>`;
 bind();
}

function bind(){
 $('#addSlot').onclick=()=>slotForm();
 $$('[data-edit]').forEach(button=>button.onclick=()=>slotForm(data.timetable.find(slot=>slot.id===button.dataset.edit)));
 $$('[data-exception]').forEach(button=>button.onclick=()=>exceptionForm(data.timetable.find(slot=>slot.id===button.dataset.exception)));
 $$('[data-delete]').forEach(button=>button.onclick=async()=>{
  const slot=data.timetable.find(item=>item.id===button.dataset.delete);
  const subject=subjectFor(slot.subject_id);
  if(!await confirmBox(`Delete the ${DAYS[slot.day_of_week]} ${shortTime(slot.start_time)} slot for ${subject?.subject_name||'this subject'}?`))return;
  try{
   await DB.deleteTimetableSlot(slot.id);
   data=await DB.all();
   draw();
   toast('Timetable slot deleted.');
  }catch(error){toast(error.message||'Unable to delete the timetable slot.','error')}
 });
}

function exceptionForm(slot){
 const subject=subjectFor(slot.subject_id);
 const defaultDate=nextDateForWeekday(Number(slot.day_of_week));
 const existingExceptions=(data.schedule_exceptions||[]).filter(ex=>ex.schedule_slot_id===slot.id);

 const m=modal({
  title:`Schedule Exception: ${esc(subject?.subject_name||'Class')}`,
  body:`<div class="notice" style="margin-bottom:14px"><div><strong>Section ${esc(slot.section)} · ${DAYS[slot.day_of_week]} ${shortTime(slot.start_time)}–${shortTime(slot.end_time)}</strong><br><span>Apply a one-day exception (Cancel, Break, or Reschedule) without changing the recurring weekly timetable.</span></div></div><form id="slotExceptionForm" class="form-grid"><div class="field full-width"><label>Exception Date (Affected Occurrence)</label><input class="input" type="date" name="exception_date" value="${defaultDate}" required></div><div class="field full-width"><label>Exception Type</label><select class="select" name="exception_type" id="ttExceptionTypeSelect"><option value="cancelled">Cancelled (Class will not take place on this date)</option><option value="break">No Class / Break (Holiday / unexpected closure)</option><option value="rescheduled">Rescheduled (Move to a different date & time)</option></select></div><div id="ttRescheduleFields" style="display:none" class="full-width"><div class="form-grid" style="padding:12px;background:#f8faff;border:1px solid #c7d2fe;border-radius:8px"><div class="field"><label>New Date</label><input class="input" type="date" name="new_date" value="${defaultDate}"></div><div class="field"><label>New Room <span class="muted">optional</span></label><input class="input" name="new_room" value="${esc(slot.room||'')}" placeholder="e.g. EE-101"></div><div class="field"><label>New Start Time</label><input class="input" type="time" name="new_start_time" value="${shortTime(slot.start_time)}"></div><div class="field"><label>New End Time</label><input class="input" type="time" name="new_end_time" value="${shortTime(slot.end_time)}"></div></div></div><div class="field full-width"><label>Reason <span class="muted">optional</span></label><textarea class="input" name="reason" rows="2" placeholder="e.g. Teacher unavailable / Holiday / Room changed"></textarea></div></form>${existingExceptions.length?`<div style="margin-top:16px"><label style="font-weight:700;display:block;margin-bottom:8px">Active Exceptions for this Slot</label>${existingExceptions.map(ex=>`<div class="schedule-exception-item"><div><span class="schedule-exception-badge ${ex.exception_type}">${ex.exception_type}</span> <strong style="margin-left:6px">${ex.exception_date}</strong>${ex.exception_type==='rescheduled'?` <span class="muted">➔ ${ex.new_date} (${shortTime(ex.new_start_time)})</span>`:''}${ex.reason?`<div class="muted" style="font-size:.78rem;margin-top:2px">${esc(ex.reason)}</div>`:''}</div><button class="btn btn-outline btn-sm" data-delete-slot-ex="${ex.id}" type="button"><i class="bi bi-trash"></i></button></div>`).join('')}</div>`:''}`,
  actions:`<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" data-save><i class="bi bi-check2-circle"></i> Save Exception</button>`
 });

 $('[data-cancel]',m.el).onclick=m.close;
 const typeSelect=$('#ttExceptionTypeSelect',m.el);
 const rescheduleFields=$('#ttRescheduleFields',m.el);

 typeSelect.onchange=()=>{
  rescheduleFields.style.display=typeSelect.value==='rescheduled'?'block':'none';
 };

 $$('[data-delete-slot-ex]',m.el).forEach(btn=>{
  btn.onclick=async()=>{
   if(!await confirmBox('Remove this exception? The slot will return to normal on that date.'))return;
   try{
    await DB.deleteScheduleException(btn.dataset.deleteSlotEx);
    data=await DB.all();
    m.close();
    draw();
    toast('Exception removed.');
   }catch(e){toast(e.message||'Failed to delete exception.','error')}
  };
 });

 $('[data-save]',m.el).onclick=async()=>{
  const form=$('#slotExceptionForm',m.el);
  if(!form.reportValidity())return;
  const values=Object.fromEntries(new FormData(form));
  if(values.exception_type==='rescheduled'){
   if(!values.new_date||!values.new_start_time||!values.new_end_time){
    toast('New date, start time, and end time are required for rescheduled classes.','error');
    return;
   }
   if(values.new_end_time<=values.new_start_time){
    toast('New end time must be later than new start time.','error');
    return;
   }
  }
  const defaultSectionId=data.profile?.section_id||'00000000-0000-0000-0000-000000000001';
  const payload={
   section_id:slot.section_id||defaultSectionId,
   schedule_slot_id:slot.id,
   exception_date:values.exception_date,
   exception_type:values.exception_type,
   reason:values.reason?.trim()||null,
   new_date:values.exception_type==='rescheduled'?values.new_date:null,
   new_start_time:values.exception_type==='rescheduled'?values.new_start_time:null,
   new_end_time:values.exception_type==='rescheduled'?values.new_end_time:null,
   new_room:values.exception_type==='rescheduled'?(values.new_room?.trim()||null):null
  };

  try{
   await DB.addScheduleException(payload);
   data=await DB.all();
   m.close();
   draw();
   toast('Schedule exception saved.');
  }catch(e){toast(e.message||'Failed to save exception.','error')}
 };
}

function slotForm(slot={}){
 const editing=Boolean(slot.id);
 const defaultSubject=subjectFor(slot.subject_id)||data.subjects[0];
 const m=modal({title:editing?'Edit timetable slot':'Add timetable slot',body:`<form id="timetableForm" class="form-grid"><div class="field"><label>Day</label><select class="select" name="day_of_week" required>${DAYS.slice(1).map((day,index)=>`<option value="${index+1}" ${Number(slot.day_of_week||1)===index+1?'selected':''}>${day}</option>`).join('')}</select></div><div class="field"><label>Subject</label><select class="select" name="subject_id" id="timetableSubject" required><option value="">Select a subject</option>${data.subjects.map(subject=>`<option value="${subject.id}" ${subject.id===defaultSubject?.id?'selected':''}>${esc(subject.subject_name)} (${esc(subject.subject_code)})</option>`).join('')}</select></div><div class="field"><label>Section</label><input class="input" name="section" id="timetableSection" value="${esc(slot.section||defaultSubject?.section||'')}" required></div><div class="field"><label>Room <span class="muted">optional</span></label><input class="input" name="room" value="${esc(slot.room||'')}" placeholder="e.g. EE-101"></div><div class="field"><label>Start Time</label><input class="input" name="start_time" type="time" value="${esc(shortTime(slot.start_time)||'08:00')}" required></div><div class="field"><label>End Time</label><input class="input" name="end_time" type="time" value="${esc(shortTime(slot.end_time)||'09:00')}" required></div></form>${data.subjects.length?'':'<div class="notice timetable-notice"><i class="bi bi-info-circle"></i> Add a subject before creating a timetable slot.</div>'}`,actions:`<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" data-save ${data.subjects.length?'':'disabled'}>${editing?'Save Changes':'Add Slot'}</button>`});
 $('[data-cancel]',m.el).onclick=m.close;
 $('#timetableSubject',m.el)?.addEventListener('change',event=>{
  const subject=subjectFor(event.target.value);
  if(subject)$('#timetableSection',m.el).value=subject.section||'';
 });
 $('[data-save]',m.el).onclick=async()=>{
  const form=$('#timetableForm',m.el);
  if(!form.reportValidity())return;
  const row=Object.fromEntries(new FormData(form));
  if(row.end_time<=row.start_time){toast('End time must be later than start time.','error');return}
  row.day_of_week=Number(row.day_of_week);
  row.section=row.section.trim();
  row.room=row.room.trim()||null;
  try{
   editing?await DB.updateTimetableSlot(slot.id,row):await DB.addTimetableSlot(row);
   data=await DB.all();
   m.close();
   draw();
   toast(editing?'Timetable slot updated.':'Timetable slot added.');
  }catch(error){toast(error.message||'Unable to save the timetable slot.','error')}
 };
}
