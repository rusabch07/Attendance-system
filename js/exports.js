import {$,esc,subjectStats,studentSubjectRows,lectureStats,toast} from './ui.js';
import {exportTableExcel,exportTablePdf,exportTableCsv,exportLectureExcel,exportLecturePdf,exportLectureCsv,formatReportDate} from './export-utils.js';
import {
  getCurrentUserContext,
  filterByActiveContext,
  getSectionLabel,
  renderAdminFilterBar
} from './access-context.js';
import {DB} from './supabase.js';

let data,type='semester',subject='',student='',section='',from='',to='',lecture='',context;

export async function render(d){
  data=d;
  context=getCurrentUserContext(data);
  draw();
}

function getScopedData(){
  const scopedStudents = filterByActiveContext(data.students, context, data);
  const scopedLectures = filterByActiveContext(data.lectures, context, data);
  const lectureIdSet = new Set(scopedLectures.map(l => l.id));
  const scopedAttendance = data.attendance.filter(a => lectureIdSet.has(a.lecture_id));
  const scopedSubjects = context.activeGroupId
    ? data.subjects.filter(s => !s.academic_group_id || s.academic_group_id === context.activeGroupId)
    : data.subjects;

  return {
    ...data,
    students: scopedStudents,
    lectures: scopedLectures,
    attendance: scopedAttendance,
    subjects: scopedSubjects
  };
}

function draw(){
  const d = getScopedData();

  $('#page').innerHTML=`
    <div id="adminFilterMount"></div>
    <div class="page-heading">
      <div>
        <h1>Export Data</h1>
        <p>Prepare clean attendance files for submission or review.</p>
        ${context.isCR ? `
          <div class="cr-context-badge">
            <i class="bi bi-cloud-arrow-down-fill"></i> ${esc(context.activeSection?.section_name || 'Section A')} (${esc(context.activeSectionCode)})
          </div>
        ` : ''}
      </div>
    </div>

    <div class="card toolbar">
      <div class="field grow">
        <label>Export Scope</label>
        <select class="select" id="type">
          <option value="semester" ${type==='semester'?'selected':''}>Entire Semester</option>
          <option value="lecture" ${type==='lecture'?'selected':''}>Single Lecture</option>
          <option value="student" ${type==='student'?'selected':''}>Student</option>
          <option value="subject" ${type==='subject'?'selected':''}>Subject</option>
          <option value="date" ${type==='date'?'selected':''}>Date Range</option>
          ${context.isAllSections ? `<option value="section" ${type==='section'?'selected':''}>Section</option>` : ''}
          <option value="short" ${type==='short'?'selected':''}>Students Below ${data.settings?.minimum_attendance||75}%</option>
        </select>
      </div>
      ${type==='lecture'?`
        <div class="field grow"><label>Lecture</label>
          <select class="select" id="lecture">
            ${d.lectures.sort((a,b)=>b.lecture_date.localeCompare(a.lecture_date)).map(l=>{
              const s=d.subjects.find(x=>x.id===l.subject_id)||{};
              return`<option value="${l.id}" ${lecture===l.id?'selected':''}>${esc(s.subject_code)} · Lecture ${l.lecture_number} · ${l.lecture_date} · ${esc(getSectionLabel(l, data))}</option>`;
            }).join('')}
          </select>
        </div>
      `:''}
      ${type==='student'?selectStudent(d):''}
      ${type==='subject'?selectSubject(d):''}
      ${type==='section'&&context.isAllSections?selectSection():''}
      ${type==='date'?`
        <div class="field"><label>From</label><input class="input" id="from" type="date" value="${from}"></div>
        <div class="field"><label>To</label><input class="input" id="to" type="date" value="${to}"></div>
      `:''}
    </div>

    <div class="export-grid">
      <article class="card export-card">
        <span class="export-icon excel"><i class="bi bi-file-earmark-spreadsheet-fill"></i></span>
        <h2>Export Excel</h2>
        <p>Download a structured .xlsx workbook ready for filtering and further analysis.</p>
        <button class="btn btn-primary" data-format="xlsx"><i class="bi bi-download"></i> Download Excel</button>
      </article>
      <article class="card export-card">
        <span class="export-icon pdf"><i class="bi bi-file-earmark-pdf-fill"></i></span>
        <h2>Export PDF</h2>
        <p>Create a professional, printable report with a clear generated date.</p>
        <button class="btn btn-primary" data-format="pdf"><i class="bi bi-download"></i> Download PDF</button>
      </article>
      <article class="card export-card">
        <span class="export-icon csv"><i class="bi bi-filetype-csv"></i></span>
        <h2>Export CSV</h2>
        <p>Get a lightweight, universal data file for spreadsheets and other systems.</p>
        <button class="btn btn-primary" data-format="csv"><i class="bi bi-download"></i> Download CSV</button>
      </article>
    </div>
    <p class="footer-note"><i class="bi bi-shield-check"></i> Exports include only the records selected above.</p>
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

function selectStudent(d){
  return `
    <div class="field grow"><label>Student</label>
      <select class="select" id="student">
        ${d.students.map(s=>`<option value="${s.id}" ${student===s.id?'selected':''}>${esc(s.roll_no)} · ${esc(s.name)} (${esc(getSectionLabel(s, data))})</option>`).join('')}
      </select>
    </div>
  `;
}

function selectSubject(d){
  return `
    <div class="field grow"><label>Subject</label>
      <select class="select" id="subject">
        ${d.subjects.map(s=>`<option value="${s.id}" ${subject===s.id?'selected':''}>${esc(s.subject_name)} (${esc(s.subject_code)})</option>`).join('')}
      </select>
    </div>
  `;
}

function selectSection(){
  return `
    <div class="field"><label>Section</label>
      <select class="select" id="section">
        <option value="">All Sections</option>
        ${context.availableSections.map(s=>`<option value="${s.id}" ${section===s.id?'selected':''}>${esc(s.section_name)} (${esc(s.section_code)})</option>`).join('')}
      </select>
    </div>
  `;
}

function getRows(){
  const d = getScopedData();
  const threshold=Number(data.settings?.minimum_attendance||75);
  if(type==='short'){
    return studentSubjectRows(d).filter(x=>x.percentage<threshold).map(x=>({
      'Roll No':x.student.roll_no,
      'Student Name':x.student.name,
      Section:getSectionLabel(x.student, data),
      Subject:x.subject.subject_name,
      Present:x.present,
      Absent:x.absent,
      'On Leave':x.leave,
      'Total Lectures':x.total,
      'Attendance %':x.percentage
    }));
  }

  let lectures=d.lectures;
  if(type==='lecture') lectures=lectures.filter(l=>l.id===(lecture||d.lectures[0]?.id));
  if(type==='subject') lectures=lectures.filter(l=>l.subject_id===(subject||d.subjects[0]?.id));
  if(type==='date') lectures=lectures.filter(l=>(!from||l.lecture_date>=from)&&(!to||l.lecture_date<=to));
  if(type==='section') lectures=lectures.filter(l=>!section||l.section_id===section||l.section===section||getSectionLabel(l, data)===section);

  const lids=lectures.map(l=>l.id),selectedStudent=student||d.students[0]?.id;
  return d.attendance.filter(a=>lids.includes(a.lecture_id)&&(type!=='student'||a.student_id===selectedStudent)).map(a=>{
    const l=d.lectures.find(x=>x.id===a.lecture_id)||{},
          s=d.students.find(x=>x.id===a.student_id)||{},
          sub=d.subjects.find(x=>x.id===l.subject_id)||{};
    return {
      Date:l.lecture_date,
      Subject:sub.subject_name,
      'Lecture Number':l.lecture_number,
      'Roll Number':s.roll_no,
      'Student Name':s.name,
      Section:getSectionLabel(l, data),
      Status:a.status==='present'?'Present':a.status==='leave'?'Leave':'Absent'
    };
  });
}

function exportOptions(){
  const d = getScopedData();
  const organization={
    universityName:data.settings?.university_name,
    className:data.settings?.class_name,
    semesterName:data.settings?.semester_name
  };
  const options={
    organization,
    policy:data.settings?.leave_calculation_policy,
    title:'CLASS ATTENDANCE REPORT',
    fileName:`${type}-attendance-report`
  };

  if(type==='student'){
    const selected=d.students.find(s=>s.id===(student||d.students[0]?.id))||{};
    options.title='STUDENT ATTENDANCE REPORT';
    options.fileName=`${selected.name||'Student'}-Attendance-Report`;
    options.metadata=[
      {label:'Student Name',value:selected.name},
      {label:'Roll Number',value:selected.roll_no},
      {label:'Section',value:getSectionLabel(selected, data)},
      {label:'Student Semester',value:selected.semester}
    ];
  }
  if(type==='subject'){
    const selected=d.subjects.find(s=>s.id===(subject||d.subjects[0]?.id))||{};
    options.title='SUBJECT ATTENDANCE REPORT';
    options.fileName=`${selected.subject_name||'Subject'}-Attendance-Report`;
    options.metadata=[
      {label:'Subject',value:selected.subject_name},
      {label:'Subject Code',value:selected.subject_code},
      {label:'Teacher',value:selected.teacher_name}
    ];
  }
  if(type==='date'){
    options.fileName='Date-Range-Attendance-Report';
    options.metadata=[
      {label:'From Date',value:formatReportDate(from)},
      {label:'To Date',value:formatReportDate(to)}
    ].filter(x=>x.value);
  }
  if(type==='section'){
    options.fileName=`Section-Attendance-Report`;
  }
  if(type==='short'){
    options.title='SHORT ATTENDANCE REPORT';
    options.fileName='Short-Attendance-Report';
    options.minimumAttendance=Number(data.settings?.minimum_attendance||75);
    options.showSummary=false;
  }
  if(type==='semester') options.fileName='Semester-Attendance-Report';
  if(type==='lecture') options.fileName='Lecture-Attendance-Report';
  return options;
}

function bind(){
  $('#type').onchange=e=>{type=e.target.value;draw()};
  const ids=['lecture','student','subject','section','from','to'];
  ids.forEach(id=>{
    const el=$(`#${id}`);
    if(el)el.onchange=e=>{({lecture:v=>lecture=v,student:v=>student=v,subject:v=>subject=v,section:v=>section=v,from:v=>from=v,to:v=>to=v}[id])(e.target.value)};
  });

  document.querySelectorAll('[data-format]').forEach(b=>b.onclick=()=>{
    const rows=getRows();
    if(!rows.length){toast('No records match this export scope.','error');return}
    if(type==='lecture'){
      const d = getScopedData();
      const selected=d.lectures.find(l=>l.id===(lecture||d.lectures[0]?.id));
      if(!selected)return;
      if(b.dataset.format==='xlsx')exportLectureExcel(data,selected);
      if(b.dataset.format==='pdf')exportLecturePdf(data,selected);
      if(b.dataset.format==='csv')exportLectureCsv(data,selected);
      return;
    }
    const name=`attendance-${type}-report`,options=exportOptions();
    if(b.dataset.format==='xlsx')exportTableExcel(name,rows,options);
    if(b.dataset.format==='pdf')exportTablePdf(options.title,rows,options);
    if(b.dataset.format==='csv')exportTableCsv(name,rows,options);
  });
}
