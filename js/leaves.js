import {DB} from './supabase.js';
import {$,$$,esc,fmtDate,modal,statusBadge,toast} from './ui.js';
import {localDateKey} from './schedule.js';
import {
  getCurrentUserContext,
  filterByActiveContext,
  getSectionLabel,
  renderAdminFilterBar
} from './access-context.js';

let data,activeTab='pending',context;
const tabLabels={pending:'Pending',approved:'Approved',rejected:'Rejected',all:'All Requests'};

export async function render(initialData){
  data=initialData;
  context=getCurrentUserContext(data);
  draw();
}

function scopedLeaves(){
  const allLeaves = data.leaves || [];
  const scopedStudents = filterByActiveContext(data.students, context, data);
  const studentIds = new Set(scopedStudents.map(s => s.id));
  return allLeaves.filter(leave => studentIds.has(leave.student_id));
}

function requestRows(){
  const leaves=scopedLeaves();
  return leaves.filter(leave=>activeTab==='all'||leave.status===activeTab).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
}

function studentFor(leave){
  return data.students.find(student=>student.id===leave.student_id)||{name:'Deleted student',roll_no:'—',section:'—'};
}

function draw(){
  const rows=requestRows(),leaves=scopedLeaves();
  const counts={
    pending:leaves.filter(leave=>leave.status==='pending').length,
    approved:leaves.filter(leave=>leave.status==='approved').length,
    rejected:leaves.filter(leave=>leave.status==='rejected').length,
    all:leaves.length
  };

  $('#page').innerHTML=`
    <div id="adminFilterMount"></div>
    <div class="page-heading">
      <div>
        <h1>Student Leaves</h1>
        <p>Review student leave requests and manage approval status.</p>
        ${context.isCR ? `
          <div class="cr-context-badge">
            <i class="bi bi-calendar2-heart-fill"></i> ${esc(context.activeSection?.section_name || 'Section A')} (${esc(context.activeSectionCode)})
          </div>
        ` : ''}
      </div>
      <button class="btn btn-primary" id="newLeave"><i class="bi bi-plus-lg"></i> New Leave</button>
    </div>

    <div class="leave-tabs" role="tablist">
      ${Object.entries(tabLabels).map(([key,label])=>`
        <button type="button" role="tab" aria-selected="${activeTab===key}" class="${activeTab===key?'active':''}" data-tab="${key}">
          ${label}<span>${counts[key]}</span>
        </button>
      `).join('')}
    </div>

    <article class="card table-card">
      <div class="table-head">
        <div>
          <h2>${tabLabels[activeTab]}</h2>
          <span class="muted">${rows.length} ${rows.length===1?'request':'requests'}</span>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table leave-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Roll Number</th>
              <th>Section</th>
              <th>From</th>
              <th>To</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(leave=>{
              const student=studentFor(leave);
              return `
                <tr>
                  <td><strong>${esc(student.name)}</strong></td>
                  <td>${esc(student.roll_no)}</td>
                  <td><span class="status blue">${esc(getSectionLabel(student, data))}</span></td>
                  <td>${fmtDate(leave.start_date)}</td>
                  <td>${fmtDate(leave.end_date)}</td>
                  <td><span class="leave-reason" title="${esc(leave.reason)}">${esc(leave.reason)}</span></td>
                  <td>${statusBadge(leave.status)}</td>
                  <td>
                    <div class="actions">
                      <button class="btn-icon" data-view="${leave.id}" title="View Details" aria-label="View details for ${esc(student.name)}"><i class="bi bi-eye"></i></button>
                      ${leave.status==='pending'?`
                        <button class="btn-icon leave-approve" data-approve="${leave.id}" title="Approve" aria-label="Approve leave for ${esc(student.name)}"><i class="bi bi-check-lg"></i></button>
                        <button class="btn-icon danger" data-reject="${leave.id}" title="Reject" aria-label="Reject leave for ${esc(student.name)}"><i class="bi bi-x-lg"></i></button>
                      `:''}
                    </div>
                  </td>
                </tr>
              `;
            }).join('')||`<tr><td colspan="8"><div class="empty"><i class="bi bi-calendar2-x"></i>No ${activeTab==='all'?'leave requests':`${activeTab} requests`} yet.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </article>
  `;

  if(context.isAdmin){
    renderAdminFilterBar($('#adminFilterMount'), data, async ()=>{
      data = await DB.all();
      context = getCurrentUserContext(data);
      draw();
    });
  }

  bind();
}

function bind(){
  $$('[data-tab]').forEach(button=>button.onclick=()=>{activeTab=button.dataset.tab;draw()});
  $('#newLeave').onclick=()=>newLeaveForm();
  $$('[data-view]').forEach(button=>button.onclick=()=>viewDetails(data.leaves.find(leave=>leave.id===button.dataset.view)));
  $$('[data-approve]').forEach(button=>button.onclick=()=>updateStatus(button.dataset.approve,'approved'));
  $$('[data-reject]').forEach(button=>button.onclick=()=>updateStatus(button.dataset.reject,'rejected'));
}

function newLeaveForm(){
  const scopedStudents = filterByActiveContext(data.students, context, data);
  if(!scopedStudents.length){toast('Add a student before creating a leave request.','error');return}

  const m=modal({
    title:'New Leave Request',
    body:`
      <form id="leaveForm" class="form-grid">
        <div class="field full-width">
          <label for="leaveStudent">Student</label>
          <select class="select" id="leaveStudent" name="student_id" required>
            ${scopedStudents.map(student=>`<option value="${student.id}">${esc(student.roll_no)} · ${esc(student.name)} · ${esc(getSectionLabel(student, data))}</option>`).join('')}
          </select>
        </div>
        <div class="field"><label for="leaveStart">From Date</label><input class="input" id="leaveStart" type="date" name="start_date" value="${localDateKey()}" required></div>
        <div class="field"><label for="leaveEnd">To Date</label><input class="input" id="leaveEnd" type="date" name="end_date" value="${localDateKey()}" required></div>
        <div class="field full-width"><label for="leaveReason">Reason</label><textarea class="input" id="leaveReason" name="reason" rows="3" maxlength="1000" required></textarea></div>
      </form>
    `,
    actions:'<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" data-submit><i class="bi bi-send"></i> Submit Request</button>'
  });

  const form=$('#leaveForm',m.el),start=$('#leaveStart',m.el),end=$('#leaveEnd',m.el);
  start.onchange=()=>{end.min=start.value;if(end.value&&end.value<start.value)end.value=start.value};
  $('[data-cancel]',m.el).onclick=m.close;
  $('[data-submit]',m.el).onclick=async()=>{
    if(!form.reportValidity())return;
    const row=Object.fromEntries(new FormData(form));
    if(row.end_date<row.start_date){end.setCustomValidity('End date must be on or after the start date.');end.reportValidity();end.setCustomValidity('');return}
    const student = data.students.find(s => s.id === row.student_id);
    const secId = student?.section_id || context.activeSectionId || null;
    try{
      await DB.addLeave({...row, section_id: secId});
      data=await DB.all();
      m.close();
      activeTab='pending';
      draw();
      toast('Leave request submitted.');
    }catch(error){toast(error.message||'Unable to submit leave request.','error')}
  };
}

async function updateStatus(id,status){
  try{
    await DB.updateLeaveStatus(id,status);
    data=await DB.all();
    draw();
    toast(`Leave request ${status}.`);
  }catch(error){toast(error.message||`Unable to ${status} leave request.`,'error')}
}

function viewDetails(leave){
  if(!leave)return;
  const student=studentFor(leave),approved=leave.status==='approved';
  modal({
    title:'Leave Request Details',
    body:`
      <div class="leave-detail-heading">
        <div class="profile-avatar"><i class="bi bi-person-fill"></i></div>
        <div><strong>${esc(student.name)}</strong><span>${esc(student.roll_no)} · ${esc(getSectionLabel(student, data))}</span></div>
      </div>
      <div class="form-grid leave-detail-grid">
        <p><strong>From</strong><br><span class="muted">${fmtDate(leave.start_date)}</span></p>
        <p><strong>To</strong><br><span class="muted">${fmtDate(leave.end_date)}</span></p>
        <p><strong>Status</strong><br>${statusBadge(leave.status)}</p>
        <p><strong>Submitted</strong><br><span class="muted">${fmtDate(String(leave.created_at||'').slice(0,10))}</span></p>
        <p class="leave-detail-reason"><strong>Reason</strong><br><span class="muted">${esc(leave.reason)}</span></p>
        ${approved&&leave.approved_at?`<p><strong>Approved</strong><br><span class="muted">${fmtDate(String(leave.approved_at).slice(0,10))}</span></p>`:''}
      </div>
    `,
    actions:'<button class="btn btn-outline" data-close>Close</button>'
  });
  const dialog=document.querySelector('.modal-backdrop:last-child');
  $('[data-close]',dialog).onclick=()=>dialog.remove();
}
