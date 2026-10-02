import {DB} from './supabase.js';
import {$,$$,esc,toast,modal,confirmBox,sortRows,setupSort} from './ui.js';
import {
  getCurrentUserContext,
  filterByActiveContext,
  getSectionLabel,
  renderAdminFilterBar
} from './access-context.js';

let data,query='',sortKey='roll_no',sortDir='asc',context;

export async function render(d){
  data=d;
  context=getCurrentUserContext(data);
  draw();
}

function visibleStudents(){
  const scoped = filterByActiveContext(data.students, context, data);
  return scoped.filter(s=>Object.values(s).some(v=>String(v).toLowerCase().includes(query)));
}

function draw(){
  const rows=sortRows(visibleStudents(),sortKey,sortDir);

  $('#page').innerHTML=`
    <div id="adminFilterMount"></div>
    <div class="page-heading">
      <div>
        <h1>Students</h1>
        <p>Manage your class roster and student information.</p>
        ${context.isCR ? `
          <div class="cr-context-badge">
            <i class="bi bi-people-fill"></i> ${esc(context.activeSection?.section_name || 'Section A')} (${esc(context.activeSectionCode)})
          </div>
        ` : ''}
      </div>
      <button class="btn btn-primary" id="addStudent"><i class="bi bi-person-plus-fill"></i> Add Student</button>
    </div>

    <div class="card toolbar">
      <div class="field grow">
        <label>Search roster</label>
        <div class="searchbox">
          <i class="bi bi-search"></i>
          <input class="input" id="studentSearch" value="${esc(query)}" placeholder="Search name, roll number, registration…">
        </div>
      </div>
      <button class="btn btn-outline" id="importBtn"><i class="bi bi-upload"></i> Import</button>
      <button class="btn btn-soft" id="exportBtn"><i class="bi bi-download"></i> Export</button>
      <input class="hidden" type="file" id="fileInput" accept=".csv,.xlsx,.xls">
    </div>

    <div class="card table-card">
      <div class="table-head">
        <h2>Class Roster</h2>
        <span class="muted">${rows.length} ${rows.length===1?'student':'students'}</span>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th class="sortable" data-sort="roll_no">Roll Number</th>
              <th class="sortable" data-sort="name">Student Name</th>
              <th>Registration Number</th>
              <th>Section</th>
              <th>Semester</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(s=>`
              <tr>
                <td><strong>${esc(s.roll_no)}</strong></td>
                <td>${esc(s.name)}</td>
                <td>${esc(s.registration_no)}</td>
                <td><span class="status blue">${esc(getSectionLabel(s, data))}</span></td>
                <td>${esc(s.semester)}</td>
                <td>
                  <div class="actions">
                    <button class="btn-icon" data-view="${s.id}" title="View"><i class="bi bi-eye"></i></button>
                    <button class="btn-icon" data-edit="${s.id}" title="Edit"><i class="bi bi-pencil"></i></button>
                    <button class="btn-icon danger" data-delete="${s.id}" title="Delete"><i class="bi bi-trash"></i></button>
                  </div>
                </td>
              </tr>
            `).join('')||`<tr><td colspan="6"><div class="empty"><i class="bi bi-people"></i>No students found in this section.</div></td></tr>`}
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
  $('#studentSearch').oninput=e=>{
    clearTimeout(timer);
    timer=setTimeout(()=>{
      query=e.target.value.toLowerCase();
      draw();
      $('#studentSearch').focus();
      $('#studentSearch').setSelectionRange(query.length,query.length);
    },120);
  };
  $('#addStudent').onclick=()=>studentForm();
  $('#importBtn').onclick=()=>$('#fileInput').click();
  $('#fileInput').onchange=importStudents;
  $('#exportBtn').onclick=exportStudents;
  $$('[data-edit]').forEach(b=>b.onclick=()=>studentForm(data.students.find(x=>x.id===b.dataset.edit)));
  $$('[data-view]').forEach(b=>b.onclick=()=>viewStudent(data.students.find(x=>x.id===b.dataset.view)));
  $$('[data-delete]').forEach(b=>b.onclick=async()=>{
    const s=data.students.find(x=>x.id===b.dataset.delete);
    if(await confirmBox(`Delete ${s.name}? Their attendance records will also be removed.`)){
      try{
        await DB.deleteStudent(s.id);
        data=await DB.all();
        draw();
        toast('Student deleted.');
      }catch(e){toast(e.message,'error')}
    }
  });
  setupSort((k,d)=>{sortKey=k;sortDir=d;draw()});
}

function studentForm(s={}){
  const edit=!!s.id;
  const sections = context.availableSections || data.sections || [];
  const defaultSectionId = s.section_id || context.activeSectionId || sections[0]?.id;

  let sectionFieldHtml = '';
  if (context.isCR) {
    sectionFieldHtml = `
      <div class="field">
        <label>Section</label>
        <input class="input" value="${esc(context.activeSection?.section_name || 'Section A')} (${esc(context.activeSectionCode)})" disabled>
        <input type="hidden" name="section_id" value="${esc(defaultSectionId)}">
        <input type="hidden" name="section" value="${esc(context.activeSection?.section_code?.split('-').pop() || 'A')}">
      </div>
    `;
  } else {
    sectionFieldHtml = `
      <div class="field">
        <label>Section</label>
        <select class="select" name="section_id" id="formSectionSelect" required>
          ${sections.map(sec => `
            <option value="${esc(sec.id)}" data-code="${esc(sec.section_code)}" ${(sec.id === defaultSectionId || sec.section_code === s.section) ? 'selected' : ''}>
              ${esc(sec.section_name)} (${esc(sec.section_code)})
            </option>
          `).join('')}
        </select>
        <input type="hidden" name="section" id="formSectionCode" value="${esc(s.section || 'A')}">
      </div>
    `;
  }

  const m=modal({
    title:edit?'Edit student':'Add student',
    body:`
      <form id="studentForm" class="form-grid">
        <div class="field"><label>Student Name</label><input class="input" name="name" value="${esc(s.name)}" required></div>
        <div class="field"><label>Roll Number</label><input class="input" name="roll_no" value="${esc(s.roll_no)}" required></div>
        <div class="field"><label>Registration Number</label><input class="input" name="registration_no" value="${esc(s.registration_no)}" required></div>
        ${sectionFieldHtml}
        <div class="field"><label>Semester</label><input class="input" name="semester" value="${esc(s.semester||'2')}" required></div>
        <div class="field"><label>Email <span class="muted">optional</span></label><input class="input" type="email" name="email" value="${esc(s.email)}"></div>
        <div class="field"><label>Phone <span class="muted">optional</span></label><input class="input" name="phone" value="${esc(s.phone)}"></div>
      </form>
    `,
    actions:`<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" data-save>${edit?'Save changes':'Add student'}</button>`
  });

  const secSelect = $('#formSectionSelect', m.el);
  if (secSelect) {
    secSelect.onchange = () => {
      const opt = secSelect.selectedOptions[0];
      const code = opt ? opt.dataset.code : 'A';
      $('#formSectionCode', m.el).value = code.startsWith('EE-') ? code.split('-').pop() : code;
    };
    secSelect.dispatchEvent(new Event('change'));
  }

  $('[data-cancel]',m.el).onclick=m.close;
  $('[data-save]',m.el).onclick=async()=>{
    const f=$('#studentForm',m.el);
    if(!f.reportValidity())return;
    const row=Object.fromEntries(new FormData(f));
    try{
      edit?await DB.updateStudent(s.id,row):await DB.addStudent(row);
      data=await DB.all();
      m.close();
      draw();
      toast(edit?'Student updated.':'Student added.');
    }catch(e){toast(e.message,'error')}
  };
}

function viewStudent(s){
  modal({
    title:'Student details',
    body:`
      <div class="profile-block">
        <div class="profile-avatar">${esc(s.name.split(' ').map(x=>x[0]).slice(0,2).join(''))}</div>
        <div><h2 style="margin:0">${esc(s.name)}</h2><span class="muted">${esc(s.roll_no)}</span></div>
      </div>
      <div class="form-grid">
        <p><strong>Registration</strong><br><span class="muted">${esc(s.registration_no)}</span></p>
        <p><strong>Section</strong><br><span class="muted">${esc(getSectionLabel(s, data))}</span></p>
        <p><strong>Semester</strong><br><span class="muted">${esc(s.semester)}</span></p>
        <p><strong>Contact</strong><br><span class="muted">${esc(s.email||s.phone||'Not provided')}</span></p>
      </div>
    `
  });
}

function exportStudents(){
  const scoped = visibleStudents();
  const rows=scoped.map(s=>({
    'Roll Number':s.roll_no,
    'Student Name':s.name,
    'Registration Number':s.registration_no,
    Section:getSectionLabel(s, data),
    Semester:s.semester,
    Email:s.email,
    Phone:s.phone
  }));
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'Students');
  XLSX.writeFile(wb,`class-students-${context.activeSectionCode.toLowerCase().replace(/[^a-z0-9]/g,'-')}.xlsx`);
}

async function importStudents(e){
  const file=e.target.files[0];
  if(!file)return;
  try{
    const wb=XLSX.read(await file.arrayBuffer());
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    let count=0;
    const defaultSecId = context.activeSectionId || data.sections?.[0]?.id;
    const defaultSecCode = context.activeSectionCode?.split('-').pop() || 'A';
    for(const r of rows){
      const row={
        roll_no:r['Roll Number']||r.roll_no,
        name:r['Student Name']||r.name,
        registration_no:r['Registration Number']||r.registration_no,
        section:String(r.Section||r.section||defaultSecCode),
        section_id:defaultSecId,
        semester:String(r.Semester||r.semester||'2'),
        email:r.Email||r.email||'',
        phone:String(r.Phone||r.phone||'')
      };
      if(row.roll_no&&row.name&&row.registration_no){
        await DB.addStudent(row);
        count++;
      }
    }
    data=await DB.all();
    draw();
    toast(`${count} students imported.`);
  }catch(err){
    toast(`Import failed: ${err.message}`,'error');
  }
  e.target.value='';
}
