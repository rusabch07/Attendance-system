import {DB} from './supabase.js';
import {$,$$,esc,fmtDate,lectureStats,modal,statusBadge,confirmBox,toast,sortRows,setupSort} from './ui.js';
import {exportLectureExcel,exportLecturePdf,exportLectureCsv} from './export-utils.js';
import {
  getCurrentUserContext,
  filterByActiveContext,
  getSectionLabel,
  renderAdminFilterBar
} from './access-context.js';

let data,filters={from:'',to:'',subject:'',student:'',section:''},sortKey='lecture_date',sortDir='desc',context;

export async function render(d){
  data=d;
  context=getCurrentUserContext(data);
  draw();
  const hash=location.hash.slice(1);
  if(hash)viewLecture(hash);
}

function scopedLectures(){
  const scoped = filterByActiveContext(data.lectures, context, data);
  return scoped.filter(l=>{
    const studentOk=!filters.student||data.attendance.some(a=>a.lecture_id===l.id&&a.student_id===filters.student);
    const secLabel = getSectionLabel(l, data);
    const sectionOk = !filters.section || l.section===filters.section || secLabel===filters.section || l.section_id===filters.section;
    return (!filters.from||l.lecture_date>=filters.from)
      && (!filters.to||l.lecture_date<=filters.to)
      && (!filters.subject||l.subject_id===filters.subject)
      && sectionOk
      && studentOk;
  });
}

function rows(){
  return sortRows(scopedLectures(),sortKey,sortDir);
}

function draw(){
  const list=rows();
  const visibleStudents = filterByActiveContext(data.students, context, data);
  const visibleSubjects = context.activeGroupId
    ? data.subjects.filter(s => !s.academic_group_id || s.academic_group_id === context.activeGroupId)
    : data.subjects;

  const sectionOptions = context.isAllSections
    ? context.availableSections.map(s => `<option value="${esc(s.id)}" ${filters.section===s.id?'selected':''}>${esc(s.section_name)} (${esc(s.section_code)})</option>`).join('')
    : '';

  $('#page').innerHTML=`
    <div id="adminFilterMount"></div>
    <div class="page-heading">
      <div>
        <h1>Attendance History</h1>
        <p>Find, review, edit, and export saved lectures.</p>
        ${context.isCR ? `
          <div class="cr-context-badge">
            <i class="bi bi-clock-history"></i> ${esc(context.activeSection?.section_name || 'Section A')} (${esc(context.activeSectionCode)})
          </div>
        ` : ''}
      </div>
    </div>

    <div class="card toolbar">
      <div class="field"><label>From Date</label><input class="input" id="from" type="date" value="${filters.from}"></div>
      <div class="field"><label>To Date</label><input class="input" id="to" type="date" value="${filters.to}"></div>
      <div class="field grow"><label>Subject</label>
        <select class="select" id="subject">
          <option value="">All Subjects</option>
          ${visibleSubjects.map(s=>`<option value="${s.id}" ${filters.subject===s.id?'selected':''}>${esc(s.subject_name)}</option>`).join('')}
        </select>
      </div>
      <div class="field grow"><label>Student</label>
        <select class="select" id="student">
          <option value="">All Students</option>
          ${visibleStudents.map(s=>`<option value="${s.id}" ${filters.student===s.id?'selected':''}>${esc(s.roll_no)} · ${esc(s.name)}</option>`).join('')}
        </select>
      </div>
      ${context.isAllSections ? `
        <div class="field"><label>Section</label>
          <select class="select" id="section">
            <option value="">All Sections</option>
            ${sectionOptions}
          </select>
        </div>
      ` : ''}
      <button class="btn btn-primary" id="filter"><i class="bi bi-funnel-fill"></i> Filter</button>
    </div>

    <div class="card table-card">
      <div class="table-head">
        <h2>Lecture Records</h2>
        <span class="muted">${list.length} ${list.length===1?'record':'records'}</span>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th class="sortable" data-sort="lecture_date">Date</th>
              <th>Subject</th>
              <th>Section</th>
              <th>Lecture No.</th>
              <th>Present</th>
              <th>Absent</th>
              <th>On Leave</th>
              <th>Attendance</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(l=>{
              const s=data.subjects.find(x=>x.id===l.subject_id)||{};
              const st=lectureStats(data,l);
              return `
                <tr>
                  <td>${fmtDate(l.lecture_date)}</td>
                  <td><strong>${esc(s.subject_name)}</strong><br><span class="muted">${esc(s.subject_code)}</span></td>
                  <td><span class="status blue">${esc(getSectionLabel(l, data))}</span></td>
                  <td>${l.lecture_number}</td>
                  <td class="text-success">${st.present}</td>
                  <td class="text-danger">${st.absent}</td>
                  <td class="text-warning">${st.leave}</td>
                  <td><strong class="${st.belowThreshold?'text-danger':'text-success'}">${st.percentage}%</strong></td>
                  <td>
                    <div class="actions">
                      <button class="btn-icon" data-view="${l.id}" title="View details"><i class="bi bi-eye"></i></button>
                      <a class="btn-icon" href="attendance.html?${DB.demo?'demo=1&':''}edit=${l.id}" title="Edit lecture"><i class="bi bi-pencil"></i></a>
                      <button class="btn-icon" data-export="${l.id}" title="Export"><i class="bi bi-download"></i></button>
                      <button class="btn-icon danger" data-delete="${l.id}" title="Delete"><i class="bi bi-trash"></i></button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('')||`<tr><td colspan="9"><div class="empty"><i class="bi bi-clock-history"></i>No attendance records match these filters.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  if(context.isAdmin){
    renderAdminFilterBar($('#adminFilterMount'), data, async ()=>{
      data = await DB.all();
      context = getCurrentUserContext(data);
      filters.section='';
      if(!filterByActiveContext(data.students,context,data).some(s=>s.id===filters.student))filters.student='';
      if(!data.subjects.some(s=>s.id===filters.subject&&s.academic_group_id===context.activeGroupId))filters.subject='';
      draw();
    });
  }

  bind();
}

function bind(){
  $('#filter').onclick=()=>{
    filters={
      from:$('#from').value,
      to:$('#to').value,
      subject:$('#subject').value,
      student:$('#student').value,
      section:$('#section')?.value||''
    };
    draw();
  };
  $$('[data-view]').forEach(b=>b.onclick=()=>viewLecture(b.dataset.view));
  $$('[data-delete]').forEach(b=>b.onclick=async()=>{
    if(await confirmBox('Delete this lecture and all of its attendance records?')){
      try{
        await DB.deleteLecture(b.dataset.delete);
        data=await DB.all();
        draw();
        toast('Lecture deleted.');
      }catch(e){toast(e.message,'error')}
    }
  });
  $$('[data-export]').forEach(b=>b.onclick=()=>exportMenu(b.dataset.export));
  setupSort((k,d)=>{sortKey=k;sortDir=d;draw()});
}

function viewLecture(id){
  const l=scopedLectures().find(x=>x.id===id);
  if(!l)return;
  const sub=data.subjects.find(x=>x.id===l.subject_id)||{};
  const st=lectureStats(data,l);
  const m=modal({
    title:'Lecture details',
    body:`
      <div class="form-grid">
        <p><strong>Subject</strong><br><span class="muted">${esc(sub.subject_name)}</span></p>
        <p><strong>Teacher</strong><br><span class="muted">${esc(sub.teacher_name)}</span></p>
        <p><strong>Date / Lecture</strong><br><span class="muted">${fmtDate(l.lecture_date)} · Lecture ${l.lecture_number}</span></p>
        <p><strong>Section</strong><br><span class="muted">${esc(getSectionLabel(l, data))}</span></p>
      </div>
      <div class="count-strip" style="margin:0 0 15px">
        <span class="count-pill">Total Students: ${st.total}</span>
        <span class="count-pill green">${st.present} Present</span>
        <span class="count-pill red">${st.absent} Absent</span>
        <span class="count-pill amber">${st.leave} On Leave</span>
        <span class="count-pill">Attendance: ${st.percentage}%</span>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Roll No</th><th>Student Name</th><th>Status</th></tr></thead>
          <tbody>
            ${st.rows.map(a=>{
              const s=data.students.find(x=>x.id===a.student_id)||{};
              return`<tr><td>${esc(s.roll_no)}</td><td>${esc(s.name)}</td><td>${statusBadge(a.status)}</td></tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `,
    actions:`<button class="btn btn-outline" data-close>Close</button><a class="btn btn-primary" href="attendance.html?${DB.demo?'demo=1&':''}edit=${id}"><i class="bi bi-pencil"></i> Edit Attendance</a>`
  });
  $('[data-close]',m.el).onclick=m.close;
}

function exportMenu(id){
  const l=data.lectures.find(x=>x.id===id);
  const m=modal({
    title:'Export lecture',
    small:true,
    body:'<p class="muted">Choose a downloadable format for this attendance record.</p>',
    actions:`<button class="btn btn-outline" data-csv>CSV</button><button class="btn btn-outline" data-pdf>PDF</button><button class="btn btn-primary" data-xlsx>Excel</button>`
  });
  $('[data-csv]',m.el).onclick=()=>{exportLectureCsv(data,l);m.close()};
  $('[data-pdf]',m.el).onclick=()=>{exportLecturePdf(data,l);m.close()};
  $('[data-xlsx]',m.el).onclick=()=>{exportLectureExcel(data,l);m.close()};
}
