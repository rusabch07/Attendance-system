import {DB} from './supabase.js';
import {$,$$,esc,toast,modal,confirmBox} from './ui.js';
import {shortTime} from './schedule.js';

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
   rows.push(`<tr class="${slot.is_active===false?'inactive-slot':''}"><td><strong>${DAYS[day]}</strong>${slot.is_active===false?'<span class="inactive-label">Inactive</span>':''}</td><td class="timetable-time"><strong>${shortTime(slot.start_time)}</strong><span class="mobile-time-end">–${shortTime(slot.end_time)}</span></td><td class="timetable-end">${shortTime(slot.end_time)}</td><td><span class="timetable-subject">${esc(subject?.subject_name||'Unknown subject')}</span><small>${esc(subject?.subject_code||'')}</small></td><td class="timetable-section">${esc(slot.section)}</td><td class="timetable-room">${esc(slot.room||'—')}</td><td><div class="actions"><button class="btn-icon" data-edit="${slot.id}" title="Edit slot" aria-label="Edit ${esc(subject?.subject_name||'timetable slot')}"><i class="bi bi-pencil"></i></button><button class="btn-icon danger" data-delete="${slot.id}" title="Delete slot" aria-label="Delete ${esc(subject?.subject_name||'timetable slot')}"><i class="bi bi-trash"></i></button></div></td></tr>`);
  });
 }
 $('#page').innerHTML=`<div class="page-heading"><div><h1>Class Timetable</h1><p>Manage the weekly class schedule used on your dashboard.</p></div><button class="btn btn-primary" id="addSlot"><i class="bi bi-plus-lg"></i> Add Time Slot</button></div><div class="card table-card"><div class="table-head"><div><h2>Weekly Schedule</h2><span class="muted timetable-count">${slots.filter(slot=>slot.is_active!==false).length} active ${slots.filter(slot=>slot.is_active!==false).length===1?'slot':'slots'}</span></div><span class="muted"><i class="bi bi-clock"></i> Device local time</span></div><div class="table-wrap"><table class="data-table timetable-table"><thead><tr><th>Day</th><th>Start Time</th><th>End Time</th><th>Subject</th><th>Section</th><th>Room</th><th>Actions</th></tr></thead><tbody>${rows.join('')}</tbody></table></div></div>`;
 bind();
}

function bind(){
 $('#addSlot').onclick=()=>slotForm();
 $$('[data-edit]').forEach(button=>button.onclick=()=>slotForm(data.timetable.find(slot=>slot.id===button.dataset.edit)));
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
