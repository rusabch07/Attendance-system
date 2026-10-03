import {$,$$,esc,subjectStats,studentSubjectRows,sortRows,setupSort} from './ui.js';
import {DB} from './supabase.js';
import {getSectionAttendancePolicy,attendancePercentageLabel} from './attendance-math.js';
import {exportTableExcel,exportTablePdf,exportTableCsv,formatReportDate} from './export-utils.js';
import {
  getCurrentUserContext,
  filterByActiveContext,
  getSectionLabel,
  renderAdminFilterBar
} from './access-context.js';

let data,mode='student',studentId='',subjectId='',section='',from='',to='',sortDir='asc',context;

export async function render(d){
  data=d;
  context=getCurrentUserContext(data);
  const visible = filterByActiveContext(data.students, context, data);
  studentId=visible[0]?.id||'';
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

function filteredLectures(d){
  return d.lectures.filter(l=>
    (!subjectId||l.subject_id===subjectId)
    && (!section||l.section===section||getSectionLabel(l, data)===section||l.section_id===section)
    && (!from||l.lecture_date>=from)
    && (!to||l.lecture_date<=to)
  );
}

function subset(){
  const base = getScopedData();
  const lectures = filteredLectures(base);
  const ids = lectures.map(l=>l.id);
  return {
    ...base,
    lectures,
    attendance: base.attendance.filter(a=>ids.includes(a.lecture_id))
  };
}

function draw(){
  const d=subset();
  const visibleStudents = d.students;
  const visibleSubjects = d.subjects;
  const sectionOptions = context.isAllSections
    ? context.availableSections.map(s => `<option value="${esc(s.id)}" ${section===s.id?'selected':''}>${esc(s.section_name)} (${esc(s.section_code)})</option>`).join('')
    : '';

  $('#page').innerHTML=`
    <div id="adminFilterMount"></div>
    <div class="page-heading">
      <div>
        <h1>Reports</h1>
        <p>Understand student progress and identify attendance risks.</p>
        ${context.isCR ? `
          <div class="cr-context-badge">
            <i class="bi bi-bar-chart-fill"></i> ${esc(context.activeSection?.section_name || 'Section A')} (${esc(context.activeSectionCode)})
          </div>
        ` : ''}
      </div>
      <div class="segmented">
        <button data-mode="student" class="${mode==='student'?'active':''}">Student</button>
        <button data-mode="subject" class="${mode==='subject'?'active':''}">Subject</button>
        <button data-mode="short" class="${mode==='short'?'active':''}">${context.isAllSections?'Below section requirement':`Below ${data.settings?.minimum_attendance||75}%`}</button>
      </div>
    </div>

    <div class="card toolbar">
      <div class="field grow"><label>Student</label>
        <select class="select" id="student" ${mode==='subject'?'disabled':''}>
          <option value="">All Students</option>
          ${visibleStudents.map(s=>`<option value="${s.id}" ${studentId===s.id?'selected':''}>${esc(s.roll_no)} · ${esc(s.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field grow"><label>Subject</label>
        <select class="select" id="subject">
          <option value="">All Subjects</option>
          ${visibleSubjects.map(s=>`<option value="${s.id}" ${subjectId===s.id?'selected':''}>${esc(s.subject_name)}</option>`).join('')}
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
      <div class="field"><label>From</label><input class="input" id="from" type="date" value="${from}"></div>
      <div class="field"><label>To</label><input class="input" id="to" type="date" value="${to}"></div>
      <button class="btn btn-primary" id="apply"><i class="bi bi-funnel-fill"></i> Apply</button>
    </div>
    <div id="reportBody">${mode==='student'?studentReport(d):mode==='subject'?subjectReport(d):shortReport(d)}</div>
  `;

  if(context.isAdmin){
    renderAdminFilterBar($('#adminFilterMount'), data, async ()=>{
      data = await DB.all();
      context = getCurrentUserContext(data);
      const visible = filterByActiveContext(data.students, context, data);
      if(!visible.some(s => s.id === studentId)) studentId = visible[0]?.id || '';
      section='';
      if(!data.subjects.some(s=>s.id===subjectId&&s.academic_group_id===context.activeGroupId))subjectId='';
      draw();
    });
  }

  bind();
}

function studentReport(d){
  const st=d.students.find(x=>x.id===studentId);
  const rows=(subjectId?d.subjects.filter(x=>x.id===subjectId):d.subjects).map(s=>({subject:s,...subjectStats(d,s.id,studentId||null)})).filter(x=>x.total);
  const summary=subjectStats(d,subjectId,studentId||null);

  return `
    ${cards(summary.total,summary.present,summary.absent,summary.leave,summary.percentage,['Total Lectures','Present','Absent','On Leave','Attendance %'])}
    <article class="card table-card">
      <div class="table-head">
        <div>
          <h2>${esc(st?.name||'All Students')}</h2>
          <span class="muted">${esc(st?.roll_no||'')} ${st?'· '+esc(getSectionLabel(st, data)):''}</span>
        </div>
        <select class="select" id="reportFormat" aria-label="Report export format"><option value="xlsx">Excel</option><option value="csv">CSV</option><option value="pdf">PDF</option></select><button class="btn btn-soft btn-sm" id="exportReport"><i class="bi bi-download"></i> Export</button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr><th>Subject</th><th>Present</th><th>Absent</th><th>On Leave</th><th>Total Lectures</th><th>Attendance %</th></tr>
          </thead>
          <tbody>
            ${rows.map(x=>`<tr><td><strong>${esc(x.subject.subject_name)}</strong></td><td>${x.present}</td><td>${x.absent}</td><td>${x.leave}</td><td>${x.total}</td><td><strong class="${color(x)}">${attendancePercentageLabel(x.percentage)}</strong></td></tr>`).join('')||empty(6)}
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function subjectReport(d){
  const sub=d.subjects.find(x=>x.id===subjectId);
  let rows=d.students.filter(s=>!section||s.section===section||s.section_id===section).map(s=>({student:s,...subjectStats(d,subjectId,s.id)})).filter(x=>x.total);
  rows=rows.sort((a,b)=>(a.percentage-b.percentage)*(sortDir==='asc'?1:-1));
  const summary=subjectStats({...d,attendance:d.attendance.filter(a=>rows.some(x=>x.student.id===a.student_id))},subjectId);
  const totalLectures=d.lectures.filter(l=>l.subject_id===subjectId).length;

  return `
    ${cards(totalLectures,summary.present,summary.absent,summary.leave,summary.percentage,['Total Lectures','Present','Absent','On Leave','Average Attendance'])}
    <article class="card table-card">
      <div class="table-head">
        <div>
          <h2>${esc(sub?.subject_name||'Select a subject')}</h2>
          <span class="muted">${esc(sub?.subject_code||'')} ${sub?'· '+esc(sub.teacher_name):''}</span>
        </div>
        <select class="select" id="reportFormat" aria-label="Report export format"><option value="xlsx">Excel</option><option value="csv">CSV</option><option value="pdf">PDF</option></select><button class="btn btn-soft btn-sm" id="exportReport"><i class="bi bi-download"></i> Export</button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Roll No</th>
              <th>Student</th>
              ${context.isAllSections ? '<th>Section</th>' : ''}
              <th>Present</th>
              <th>Absent</th>
              <th>On Leave</th>
              <th>Total</th>
              <th class="sortable" data-sort="percentage">Percentage</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(x=>`
              <tr>
                <td>${esc(x.student.roll_no)}</td>
                <td><strong>${esc(x.student.name)}</strong></td>
                ${context.isAllSections ? `<td><span class="status blue">${esc(getSectionLabel(x.student, data))}</span></td>` : ''}
                <td>${x.present}</td>
                <td>${x.absent}</td>
                <td>${x.leave}</td>
                <td>${x.total}</td>
                <td><strong class="${color(x)}">${attendancePercentageLabel(x.percentage)}</strong></td>
              </tr>
            `).join('')||empty(context.isAllSections ? 8 : 7)}
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function shortReport(d){
  const threshold=Number(data.settings?.minimum_attendance||75);
  let rows=studentSubjectRows(d).filter(x=>x.belowThreshold&&(!section||x.student.section===section||x.student.section_id===section)&&(!studentId||x.student.id===studentId)&&(!subjectId||x.subject.id===subjectId));

  return `
    <article class="card table-card">
      <div class="table-head">
        <div>
          <h2>Short Attendance List</h2>
          <span class="muted">${context.isAllSections?'Threshold: Section-specific':`Students below ${threshold}%`} · ${rows.length} records</span>
        </div>
        <div class="actions">
          <button class="btn btn-outline btn-sm" data-short="csv">CSV</button>
          <button class="btn btn-outline btn-sm" data-short="pdf">PDF</button>
          <button class="btn btn-primary btn-sm" data-short="xlsx">Excel</button>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Roll No</th>
              <th>Student Name</th>
              ${context.isAllSections ? '<th>Section</th>' : ''}
              <th>Subject</th>
              <th>Present</th>
              <th>Absent</th>
              <th>On Leave</th>
              <th>Total Lectures</th>
              <th>Attendance %</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(x=>`
              <tr>
                <td>${esc(x.student.roll_no)}</td>
                <td><strong>${esc(x.student.name)}</strong></td>
                ${context.isAllSections ? `<td><span class="status blue">${esc(getSectionLabel(x.student, data))}</span></td>` : ''}
                <td>${esc(x.subject.subject_name)}</td>
                <td>${x.present}</td>
                <td>${x.absent}</td>
                <td>${x.leave}</td>
                <td>${x.total}</td>
                <td><strong class="text-danger">${attendancePercentageLabel(x.percentage)}</strong></td>
              </tr>
            `).join('')||empty(context.isAllSections ? 9 : 8)}
          </tbody>
        </table>
      </div>
    </article>
  `;
}

function cards(total,present,absent,leave,percentage,labels=['Total Lectures','Present','Absent','On Leave','Attendance %']){
  return `<div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(135px,1fr))">${[['bi-calendar2-week-fill',labels[0],total,'#1677ff','#e6f1ff'],['bi-check-circle-fill',labels[1],present,'#16a65a','#e3f8ed'],['bi-x-circle-fill',labels[2],absent,'#ef4444','#ffe8e9'],['bi-calendar2-minus-fill',labels[3],leave,'#e69718','#fff1d1'],['bi-percent',labels[4],attendancePercentageLabel(percentage),'#7857d8','#f0ebff']].map(x=>`<article class="card stat-card" style="--accent:${x[3]};--tint:${x[4]}"><div class="stat-label">${x[1]}</div><div class="stat-value"><span class="stat-icon"><i class="bi ${x[0]}"></i></span>${x[2]}</div></article>`).join('')}</div>`;
}

function color(x){return x.belowThreshold?'text-danger':x.percentage>=90?'text-success':'text-blue'}
function empty(n){return`<tr><td colspan="${n}"><div class="empty"><i class="bi bi-bar-chart"></i>No report data for these filters.</div></td></tr>`}

function currentRows(){
  const d=subset();
  if(mode==='student'){
    return (subjectId?d.subjects.filter(x=>x.id===subjectId):d.subjects).map(s=>{
      const x=subjectStats(d,s.id,studentId||null);
      return {...policyFields(x),Subject:s.subject_name,Present:x.present,Absent:x.absent,'On Leave':x.leave,'Total Lectures':x.total,'Attendance %':`${attendancePercentageLabel(x.percentage)}`};
    }).filter(x=>x['Total Lectures']);
  }
  if(mode==='subject'){
    return d.students.filter(s=>!section||s.section_id===section).map(s=>{
      const x=subjectStats(d,subjectId,s.id);
      return {...policyFields(x),'Roll No':s.roll_no,Student:s.name,Section:getSectionLabel(s, data),Present:x.present,Absent:x.absent,'On Leave':x.leave,Total:x.total,Percentage:`${attendancePercentageLabel(x.percentage)}`};
    }).filter(x=>x.Total);
  }
  return studentSubjectRows(d).filter(x=>x.belowThreshold&&(!section||x.student.section_id===section)&&(!studentId||x.student.id===studentId)&&(!subjectId||x.subject.id===subjectId)).map(x=>({
    ...policyFields(x),
    'Roll No':x.student.roll_no,
    'Student Name':x.student.name,
    Section:getSectionLabel(x.student, data),
    Subject:x.subject.subject_name,
    Present:x.present,
    Absent:x.absent,
    'On Leave':x.leave,
    'Total Lectures':x.total,
    'Attendance %':`${attendancePercentageLabel(x.percentage)}`
  }));
}

function baseReportExportOptions(){
  const organization={universityName:data.settings?.university_name,className:data.settings?.class_name,semesterName:data.settings?.semester_name};
  if(mode==='student'){
    const selected=data.students.find(s=>s.id===studentId)||{};
    return {
      organization,
      policy:mode==='student'&&studentId?getSectionAttendancePolicy(data,data.students.find(s=>s.id===studentId)?.section_id).leavePolicy:data.settings?.leave_calculation_policy,
      showSummary:!context.isAllSections || (mode==='student'&&!!studentId),
      title:'STUDENT ATTENDANCE REPORT',
      fileName:`${selected.name||'Student'}-Attendance-Report`,
      metadata:[
        {label:'Student Name',value:selected.name},
        {label:'Roll Number',value:selected.roll_no},
        {label:'Section',value:getSectionLabel(selected, data)},
        {label:'Student Semester',value:selected.semester}
      ],
      columns:['Subject','Present','Absent','On Leave','Total Lectures','Attendance %'].map(key=>({key,label:key}))
    };
  }
  if(mode==='subject'){
    const selected=data.subjects.find(s=>s.id===subjectId)||{};
    return {
      organization,
      policy:mode==='student'&&studentId?getSectionAttendancePolicy(data,data.students.find(s=>s.id===studentId)?.section_id).leavePolicy:data.settings?.leave_calculation_policy,
      showSummary:!context.isAllSections || (mode==='student'&&!!studentId),
      title:'SUBJECT ATTENDANCE REPORT',
      fileName:`${selected.subject_name||'Subject'}-Attendance-Report`,
      metadata:[
        {label:'Subject',value:selected.subject_name},
        {label:'Subject Code',value:selected.subject_code},
        {label:'Teacher',value:selected.teacher_name}
      ],
      columns:[
        {key:'Roll No',label:'Roll No'},
        {key:'Student',label:'Student Name'},
        {key:'Section',label:'Section'},
        {key:'Present',label:'Present'},
        {key:'Absent',label:'Absent'},
        {key:'On Leave',label:'On Leave'},
        {key:'Total',label:'Total Lectures'},
        {key:'Percentage',label:'Attendance %'}
      ]
    };
  }
  const threshold=Number(data.settings?.minimum_attendance||75);
  return {
    organization,
    policy:data.settings?.leave_calculation_policy,
    title:'SHORT ATTENDANCE REPORT',
    fileName:'Short-Attendance-Report',
    minimumAttendance:context.isAllSections?undefined:threshold,
    showSummary:false,
    metadata:[
      {label:'Subject',value:data.subjects.find(s=>s.id===subjectId)?.subject_name},
      {label:'From Date',value:formatReportDate(from)},
      {label:'To Date',value:formatReportDate(to)}
    ].filter(x=>x.value),
    columns:['Roll No','Student Name','Section','Subject','Present','Absent','On Leave','Total Lectures','Attendance %'].map(key=>({key,label:key}))
  };
}

function reportExportOptions(){
  const options=baseReportExportOptions();
  if(context.isAllSections&&currentRows()[0]?.['Minimum Attendance']!==undefined)options.columns.push(...['Minimum Attendance','Leave Policy','Requirement Status'].map(key=>({key,label:key})));
  return options;
}

function policyFields(x){return context.isAllSections&&x.minimumAttendance!==undefined?{'Minimum Attendance':x.minimumAttendance,'Leave Policy':x.leavePolicy,'Requirement Status':x.belowThreshold?'Below requirement':'Meets requirement'}:{}}

function exportMenu(){
  const rows=currentRows(),options=reportExportOptions();

  const format=$('#reportFormat').value;
  if(format==='csv')exportTableCsv(options.fileName,rows,options);
  else if(format==='pdf')exportTablePdf(options.title,rows,options);
  else exportTableExcel(options.fileName,rows,options);
}

function bind(){
  $$('[data-mode]').forEach(b=>b.onclick=()=>{
    mode=b.dataset.mode;
    if(mode==='subject'&&!subjectId) subjectId=data.subjects[0]?.id||'';
    if(mode==='short'){studentId='';subjectId=''}
    draw();
  });
  $('#apply').onclick=()=>{
    studentId=$('#student').value;
    subjectId=$('#subject').value;
    section=$('#section')?.value||'';
    from=$('#from').value;
    to=$('#to').value;
    draw();
  };
  $('#exportReport')?.addEventListener('click',exportMenu);
  $$('[data-short]').forEach(b=>b.onclick=()=>{
    const rows=currentRows(),options=reportExportOptions();
    if(b.dataset.short==='csv') exportTableCsv(options.fileName,rows,options);
    if(b.dataset.short==='pdf') exportTablePdf(options.title,rows,options);
    if(b.dataset.short==='xlsx') exportTableExcel(options.fileName,rows,options);
  });
  setupSort((k,d)=>{sortDir=d;draw()});
}
