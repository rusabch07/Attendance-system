import {DB} from './supabase.js';
import {$,$$,esc,toast,modal,confirmBox,sortRows,setupSort} from './ui.js';
import {
  getCurrentUserContext,
  renderAdminFilterBar
} from './access-context.js';

let data,query='',sortKey='subject_code',sortDir='asc',context;

export async function render(d){
  data=d;
  context=getCurrentUserContext(data);
  draw();
}

function visibleSubjects(){
  const scoped = context.activeGroupId
    ? data.subjects.filter(s => !s.academic_group_id || s.academic_group_id === context.activeGroupId)
    : data.subjects;
  return scoped.filter(s=>Object.values(s).some(v=>String(v).toLowerCase().includes(query)));
}

function draw(){
  const rows=sortRows(visibleSubjects(),sortKey,sortDir);

  const addAction = context.isAdmin
    ? `<button class="btn btn-primary" id="addSubject"><i class="bi bi-plus-lg"></i> Add Subject</button>`
    : `<span class="badge" style="background:#eaf3ff;color:var(--blue-dark);padding:8px 12px;border-radius:8px;font-weight:700;font-size:.82rem;"><i class="bi bi-info-circle"></i> Shared subjects managed by Faculty</span>`;

  $('#page').innerHTML=`
    <div id="adminFilterMount"></div>
    <div class="page-heading">
      <div>
        <h1>Subjects</h1>
        <p>Shared subjects offered across all sections in this academic group.</p>
        ${context.isCR ? `
          <div class="cr-context-badge">
            <i class="bi bi-journal-bookmark-fill"></i> ${esc(context.activeGroup?.department || 'Electrical Engineering')} · ${esc(context.activeGroup?.batch || '2025')} (${esc(context.activeGroup?.semester || 'Semester 2')})
          </div>
        ` : ''}
      </div>
      <div>
        ${addAction}
      </div>
    </div>

    <div class="card toolbar">
      <div class="field grow">
        <label>Search subjects</label>
        <div class="searchbox">
          <i class="bi bi-search"></i>
          <input id="subjectSearch" class="input" value="${esc(query)}" placeholder="Search code, subject, or teacher…">
        </div>
      </div>
    </div>

    <div class="card table-card">
      <div class="table-head">
        <h2>Subject Catalogue</h2>
        <span class="muted">${rows.length} ${rows.length===1?'subject':'subjects'}</span>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th class="sortable" data-sort="subject_code">Subject Code</th>
              <th class="sortable" data-sort="subject_name">Subject Name</th>
              <th>Teacher</th>
              <th>Semester</th>
              <th>Offering</th>
              <th>Credit Hours</th>
              <th>Total Lectures</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(s=>`
              <tr>
                <td><strong>${esc(s.subject_code)}</strong></td>
                <td>${esc(s.subject_name)}</td>
                <td>${esc(s.teacher_name)}</td>
                <td>${esc(s.semester)}</td>
                <td><span class="status blue">Shared Group</span></td>
                <td>${esc(s.credit_hours||'—')}</td>
                <td>${data.lectures.filter(l=>l.subject_id===s.id).length}</td>
                <td>
                  <div class="actions">
                    <button class="btn-icon" data-view="${s.id}" title="View details"><i class="bi bi-eye"></i></button>
                    ${context.isAdmin ? `
                      <button class="btn-icon" data-edit="${s.id}" title="Edit subject"><i class="bi bi-pencil"></i></button>
                      <button class="btn-icon danger" data-delete="${s.id}" title="Delete subject"><i class="bi bi-trash"></i></button>
                    ` : ''}
                  </div>
                </td>
              </tr>
            `).join('')||`<tr><td colspan="8"><div class="empty"><i class="bi bi-journals"></i>No subjects found for this academic group.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
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
  let timer;
  $('#subjectSearch').oninput=e=>{
    clearTimeout(timer);
    timer=setTimeout(()=>{
      query=e.target.value.toLowerCase();
      draw();
      $('#subjectSearch').focus();
      $('#subjectSearch').setSelectionRange(query.length,query.length);
    },120);
  };

  const addBtn = $('#addSubject');
  if(addBtn) addBtn.onclick=()=>subjectForm();

  $$('[data-view]').forEach(b=>b.onclick=()=>viewSubject(data.subjects.find(x=>x.id===b.dataset.view)));

  if(context.isAdmin){
    $$('[data-edit]').forEach(b=>b.onclick=()=>subjectForm(data.subjects.find(x=>x.id===b.dataset.edit)));
    $$('[data-delete]').forEach(b=>b.onclick=async()=>{
      const s=data.subjects.find(x=>x.id===b.dataset.delete);
      if(await confirmBox(`Delete ${s.subject_name}? All section lectures and attendance for this subject will also be removed.`)){
        try{
          await DB.deleteSubject(s.id);
          data=await DB.all();
          draw();
          toast('Subject deleted.');
        }catch(e){toast(e.message,'error')}
      }
    });
  }

  setupSort((k,d)=>{sortKey=k;sortDir=d;draw()});
}

function subjectForm(s={}){
  const edit=!!s.id;
  const targetGroupId = s.academic_group_id || context.activeGroupId || data.academic_groups?.[0]?.id;

  const m=modal({
    title:edit?'Edit subject':'Add subject',
    body:`
      <form id="subjectForm" class="form-grid">
        <div class="field"><label>Subject Name</label><input class="input" name="subject_name" value="${esc(s.subject_name)}" required></div>
        <div class="field"><label>Subject Code</label><input class="input" name="subject_code" value="${esc(s.subject_code)}" required></div>
        <div class="field"><label>Teacher Name</label><input class="input" name="teacher_name" value="${esc(s.teacher_name)}" required></div>
        <div class="field"><label>Semester</label><input class="input" name="semester" value="${esc(s.semester||context.activeGroup?.semester||'2')}" required></div>
        <div class="field"><label>Scope</label><input class="input" value="Shared by all sections (${esc(context.activeGroup?.department || 'Academic Group')})" disabled></div>
        <div class="field"><label>Credit Hours <span class="muted">optional</span></label><input class="input" name="credit_hours" type="number" min="1" max="6" value="${esc(s.credit_hours||'')}"></div>
        <input type="hidden" name="section" value="Shared">
        <input type="hidden" name="academic_group_id" value="${esc(targetGroupId)}">
      </form>
    `,
    actions:`<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" data-save>${edit?'Save changes':'Add subject'}</button>`
  });

  $('[data-cancel]',m.el).onclick=m.close;
  $('[data-save]',m.el).onclick=async()=>{
    const f=$('#subjectForm',m.el);
    if(!f.reportValidity())return;
    const row=Object.fromEntries(new FormData(f));
    row.credit_hours=row.credit_hours?Number(row.credit_hours):null;
    try{
      edit?await DB.updateSubject(s.id,row):await DB.addSubject(row);
      data=await DB.all();
      m.close();
      draw();
      toast(edit?'Subject updated.':'Shared subject added to academic group.');
    }catch(e){toast(e.message,'error')}
  };
}

function viewSubject(s){
  const lectures=data.lectures.filter(l=>l.subject_id===s.id).length;
  modal({
    title:'Subject details',
    body:`
      <div class="profile-block">
        <div class="profile-avatar"><i class="bi bi-journal-bookmark-fill"></i></div>
        <div><h2 style="margin:0">${esc(s.subject_name)}</h2><span class="muted">${esc(s.subject_code)}</span></div>
      </div>
      <div class="form-grid">
        <p><strong>Teacher</strong><br><span class="muted">${esc(s.teacher_name)}</span></p>
        <p><strong>Semester / Scope</strong><br><span class="muted">${esc(s.semester)} / Shared Group Subject</span></p>
        <p><strong>Credit Hours</strong><br><span class="muted">${esc(s.credit_hours||'Not set')}</span></p>
        <p><strong>Total Recorded Lectures</strong><br><span class="muted">${lectures}</span></p>
      </div>
    `
  });
}
