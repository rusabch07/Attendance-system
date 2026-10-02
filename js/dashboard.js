import {DB} from './supabase.js';
import {$,$$,esc,toast,modal,confirmBox,subjectStats,studentSubjectRows,pageLink} from './ui.js';
import {attendanceStats} from './attendance-math.js';
import {localDateKey,shortTime,resolveTodayScheduleItems} from './schedule.js';
import {
  getCurrentUserContext,
  filterByActiveContext,
  getSectionLabel,
  renderAdminFilterBar,
  showSectionRequiredModal
} from './access-context.js';

let appData;
let rawData;

export async function render(data){
  rawData = data;
  const context = getCurrentUserContext(data);

  // Scoped datasets based on active role & section context
  const scopedStudents = filterByActiveContext(data.students, context, data);
  const scopedTimetable = filterByActiveContext(data.timetable, context, data);
  const scopedLectures = filterByActiveContext(data.lectures, context, data);
  const lectureIdSet = new Set(scopedLectures.map(l => l.id));
  const scopedAttendance = data.attendance.filter(a => lectureIdSet.has(a.lecture_id));

  // Subjects are shared by academic group
  const scopedSubjects = context.activeGroupId
    ? data.subjects.filter(s => !s.academic_group_id || s.academic_group_id === context.activeGroupId)
    : data.subjects;

  const scopedData = {
    ...data,
    students: scopedStudents,
    timetable: scopedTimetable,
    lectures: scopedLectures,
    attendance: scopedAttendance,
    subjects: scopedSubjects
  };
  appData = scopedData;

  const threshold = Number(data.settings?.minimum_attendance || 75);
  const totalLectures = scopedLectures.length;
  const summary = attendanceStats(scopedAttendance, data.settings?.leave_calculation_policy);
  const avg = summary.percentage;
  const today = localDateKey();

  const todayScheduleItems = resolveTodayScheduleItems(scopedData, new Date());
  const todayLectures = scopedLectures.filter(item => item.lecture_date === today);
  const todayLectureIds = new Set(todayLectures.map(l => l.id));
  const todayAttendance = scopedAttendance.filter(a => todayLectureIds.has(a.lecture_id));
  const todayPresent = todayAttendance.filter(a => a.status === 'present').length;
  const todayAbsent = todayAttendance.filter(a => a.status === 'absent').length;

  const subjectRows = scopedSubjects.map(subject => ({ subject, ...subjectStats(scopedData, subject.id) }));
  const short = studentSubjectRows(scopedData).filter(item => item.percentage < threshold).sort((a,b) => a.percentage - b.percentage);

  // Stats cards tailored for All Sections vs Specific Section
  let statsCardsHtml = '';
  if (context.isAllSections) {
    const totalSections = context.availableSections.length || 1;
    statsCardsHtml = `
      ${stat('bi-building-fill', 'Total Sections', totalSections, '#0ea5e9', '#e0f2fe')}
      ${stat('bi-people-fill', 'Total Students', scopedStudents.length, '#1677ff', '#e6f1ff')}
      ${stat('bi-calendar2-day-fill', "Today's Classes", todayScheduleItems.length, '#e89b17', '#fff4d9')}
      ${stat('bi-graph-up-arrow', 'Overall Attendance', `${avg}%`, '#0b9852', '#e3f8ed')}
      ${stat('bi-calendar2-week-fill', 'Total Lectures', totalLectures, '#ef4d58', '#ffe9eb')}
      ${stat('bi-exclamation-triangle-fill', `Below ${threshold}%`, short.length, '#ef4444', '#ffe8e9')}
    `;
  } else {
    statsCardsHtml = `
      ${stat('bi-people-fill', 'Total Students', scopedStudents.length, '#1677ff', '#e6f1ff')}
      ${stat('bi-calendar2-day-fill', "Today's Classes", todayScheduleItems.length, '#e89b17', '#fff4d9')}
      ${stat('bi-check-circle-fill', 'Present Today', todayPresent, '#0b9852', '#e3f8ed')}
      ${stat('bi-x-circle-fill', 'Absent Today', todayAbsent, '#ef4444', '#ffe8e9')}
      ${stat('bi-graph-up-arrow', 'Average Attendance', `${avg}%`, '#1677ff', '#e6f1ff')}
      ${stat('bi-exclamation-triangle-fill', `Below ${threshold}%`, short.length, '#ef4444', '#ffe8e9')}
    `;
  }

  // Header Take Attendance action button
  const takeAttendanceAction = (context.isAdmin && context.isAllSections)
    ? `<button class="btn btn-primary" id="btnAdminTakeAttendanceBlocked" type="button"><i class="bi bi-calendar2-check"></i> Take Attendance</button>`
    : `<a class="btn btn-primary" href="attendance.html${DB.qs}"><i class="bi bi-calendar2-check"></i> Take Attendance</a>`;

  // Schedule table header: include "Section" column if in All Sections mode
  const scheduleTableHead = context.isAllSections
    ? `<tr><th>Time</th><th>Section</th><th>Subject</th><th>Room</th><th>Status</th><th>Action</th></tr>`
    : `<tr><th>Time</th><th>Subject</th><th>Room</th><th>Status</th><th>Action</th></tr>`;

  $('#page').innerHTML = `
    <div id="adminFilterMount"></div>
    <div class="page-heading">
      <div>
        <h1>Dashboard</h1>
        <p>Live attendance health across your ${context.isAllSections ? 'sections' : 'class'}.</p>
        ${context.isCR ? `<div class="cr-context-badge"><i class="bi bi-geo-alt-fill"></i> ${esc(context.fullContextTitle)}</div>` : ''}
      </div>
      <div>
        ${takeAttendanceAction}
      </div>
    </div>

    <div class="stats-grid">
      ${statsCardsHtml}
    </div>

    <div class="dashboard-grid">
      <article class="card table-card full-span today-schedule">
        <div class="table-head schedule-head">
          <div>
            <h2><i class="bi bi-calendar2-week"></i> Today's Schedule</h2>
            <span class="muted" id="scheduleDate"></span>
          </div>
          <div class="schedule-head-actions">
            <button class="btn btn-soft btn-sm" id="btnMarkRemainingBreak" type="button"><i class="bi bi-pause-circle"></i> Mark Remaining as No Class</button>
            <a href="timetable.html${DB.qs}" class="schedule-link">View Full Timetable <i class="bi bi-arrow-right"></i></a>
          </div>
        </div>
        <div class="table-wrap">
          <table class="data-table schedule-table">
            <thead>${scheduleTableHead}</thead>
            <tbody id="todayScheduleRows"></tbody>
          </table>
        </div>
      </article>

      <article class="card chart-card">
        <div class="chart-head">
          <h2>Subject-wise Attendance</h2>
          <span class="muted">Average %</span>
        </div>
        <div class="chart-wrap">
          <canvas id="subjectChart"></canvas>
        </div>
      </article>

      <article class="card chart-card">
        <div class="chart-head">
          <h2>Attendance Trend</h2>
          <span class="muted">Recent lectures</span>
        </div>
        <div class="chart-wrap">
          <canvas id="trendChart"></canvas>
        </div>
      </article>

      <article class="card table-card full-span">
        <div class="table-head">
          <h2>Students Below ${threshold}%</h2>
          <a href="reports.html${DB.qs}" class="btn btn-soft btn-sm">View report</a>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Roll No</th>
                <th>Student Name</th>
                ${context.isAllSections ? '<th>Section</th>' : ''}
                <th>Subject</th>
                <th>Present / Total</th>
                <th>Attendance</th>
              </tr>
            </thead>
            <tbody>
              ${short.slice(0, 8).map(item => `
                <tr>
                  <td><strong>${esc(item.student.roll_no)}</strong></td>
                  <td>${esc(item.student.name)}</td>
                  ${context.isAllSections ? `<td><span class="status blue">${esc(getSectionLabel(item.student, data))}</span></td>` : ''}
                  <td>${esc(item.subject.subject_name)}</td>
                  <td>${item.present} / ${item.total}</td>
                  <td><strong class="text-danger">${item.percentage}%</strong></td>
                </tr>
              `).join('') || `<tr><td colspan="${context.isAllSections ? 6 : 5}"><div class="empty"><i class="bi bi-emoji-smile"></i>No students are below the requirement.</div></td></tr>`}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  `;

  // Mount Admin View Control Bar if Admin
  if (context.isAdmin) {
    renderAdminFilterBar($('#adminFilterMount'), data, async () => {
      // Re-render when filter changes
      const updatedData = await DB.all();
      render(updatedData);
    });
  }

  // Handle Take Attendance blocked in All Sections mode
  const blockedBtn = $('#btnAdminTakeAttendanceBlocked');
  if (blockedBtn) {
    blockedBtn.onclick = () => {
      showSectionRequiredModal(data, (selectedSecId) => {
        location.href = `attendance.html${DB.demo ? '?demo=1' : ''}`;
      });
    };
  }

  renderTodaySchedule(scopedData, context);
  drawCharts(subjectRows, scopedData);
}

function renderTodaySchedule(data, context){
  const now = new Date();
  const dateKey = localDateKey(now);
  const dateNode = $('#scheduleDate');
  const rowsNode = $('#todayScheduleRows');
  if(!dateNode || !rowsNode) return;
  dateNode.textContent = new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'2-digit',month:'short',year:'numeric'}).format(now);
  const items = resolveTodayScheduleItems(data, now);

  const colSpan = context.isAllSections ? 6 : 5;

  rowsNode.innerHTML = items.map(item => {
    const subject = item.subject;
    const slot = item.slot;
    const sectionCol = context.isAllSections
      ? `<td><span class="status blue">${esc(getSectionLabel(slot, rawData))}</span></td>`
      : '';

    return `
      <tr>
        <td class="schedule-time">${esc(item.displayTime)}${item.isRescheduled ? '<small class="text-primary"><i class="bi bi-arrow-repeat"></i> Rescheduled</small>' : ''}</td>
        ${sectionCol}
        <td><strong>${esc(subject?.subject_name || 'Unknown subject')}</strong><small>${esc(slot.section || '')} · ${esc(subject?.subject_code || '')}</small></td>
        <td>${esc(slot.room || '—')}</td>
        <td>${scheduleBadge(item)}</td>
        <td>${scheduleAction(item, dateKey)}</td>
      </tr>
    `;
  }).join('') || `<tr><td colspan="${colSpan}"><div class="empty schedule-empty"><i class="bi bi-calendar2"></i><strong>No classes scheduled today</strong><span>Use the timetable page to add a weekly class slot.</span></div></td></tr>`;

  bindTodaySchedule(data, items, dateKey);
}

function scheduleBadge(item){
  const labels={upcoming:'Upcoming',current:'Current',completed:'Completed',awaiting:'Awaiting Attendance',taken:'Attendance Taken',cancelled:'Cancelled',break:'No Class',rescheduled:'Rescheduled'};
  const icons={upcoming:'bi-clock-fill',current:'bi-record-circle-fill',completed:'bi-check-circle-fill',awaiting:'bi-exclamation-circle-fill',taken:'bi-check-circle-fill',cancelled:'bi-x-circle-fill',break:'bi-pause-circle-fill',rescheduled:'bi-arrow-repeat'};

  if(item.status==='cancelled'){
    return `<span class="schedule-status cancelled"><i class="bi ${icons.cancelled}"></i>Cancelled</span>${item.reason?`<small class="schedule-reason" title="${esc(item.reason)}">${esc(item.reason)}</small>`:''}`;
  }
  if(item.status==='break'){
    return `<span class="schedule-status break"><i class="bi ${icons.break}"></i>No Class</span>${item.reason?`<small class="schedule-reason" title="${esc(item.reason)}">${esc(item.reason)}</small>`:''}`;
  }
  if(item.status==='rescheduled'){
    const targetDate=item.rescheduledTo?.date||'';
    const targetTime=shortTime(item.rescheduledTo?.start_time);
    return `<span class="schedule-status rescheduled"><i class="bi ${icons.rescheduled}"></i>Rescheduled</span><small class="schedule-reason">To ${esc(targetDate)} ${esc(targetTime)}</small>${item.reason?`<small class="schedule-reason" title="${esc(item.reason)}">${esc(item.reason)}</small>`:''}`;
  }
  if(item.isRescheduled){
    return `<span class="schedule-status rescheduled-badge"><i class="bi bi-arrow-repeat"></i>Rescheduled</span> <span class="schedule-status ${item.status}"><i class="bi ${icons[item.status]}"></i>${labels[item.status]}</span>${item.reason?`<small class="schedule-reason" title="${esc(item.reason)}">${esc(item.reason)}</small>`:''}`;
  }
  return `<span class="schedule-status ${item.status}"><i class="bi ${icons[item.status]}"></i>${labels[item.status]}</span>`;
}

function scheduleAction(item,dateKey){
  if(item.lecture) return `<a class="btn btn-outline btn-sm schedule-action" href="history.html${DB.qs}#${encodeURIComponent(item.lecture.id)}">View</a>`;
  if(item.status==='cancelled'||item.status==='break'||item.status==='rescheduled'){
    return `<div style="display:flex;align-items:center;gap:6px"><button class="btn btn-soft btn-sm schedule-action" data-revert-exception="${item.exception?.id}" title="Revert exception and restore normal class">Restore</button></div>`;
  }
  const params=new URLSearchParams();
  if(DB.demo)params.set('demo','1');
  params.set('subject',item.slot.subject_id);
  params.set('section',item.slot.section);
  params.set('date',dateKey);
  params.set('slot',item.slot.id);
  if(item.isRescheduled)params.set('rescheduled','1');

  const attendanceButton=item.status==='upcoming'?'<span class="muted">—</span>':`<a class="btn btn-primary btn-sm schedule-action" href="attendance.html?${params.toString()}">Take Attendance</a>`;
  const exceptionButton=`<button class="btn-icon" data-quick-exception="${item.slot.id}" data-date="${dateKey}" title="Cancel, Break, or Reschedule"><i class="bi bi-calendar2-x"></i></button>`;

  return `<div style="display:flex;align-items:center;gap:6px">${attendanceButton}${exceptionButton}</div>`;
}

function bindTodaySchedule(data,items,dateKey){
  $$('[data-revert-exception]').forEach(b=>{
    b.onclick=async()=>{
      if(!await confirmBox('Restore this class back to the normal schedule?'))return;
      try{
        await DB.deleteScheduleException(b.dataset.revertException);
        rawData = await DB.all();
        render(rawData);
        toast('Exception removed. Class restored.');
      }catch(e){toast(e.message||'Unable to restore class.','error')}
    };
  });

  $$('[data-quick-exception]').forEach(b=>{
    b.onclick=()=>{
      const slotId=b.dataset.quickException;
      const slot=data.timetable.find(s=>s.id===slotId);
      if(slot)openExceptionDialog(slot,dateKey);
    };
  });

  const breakBtn=$('#btnMarkRemainingBreak');
  if(breakBtn){
    breakBtn.onclick=()=>{
      const remaining=items.filter(item=>!item.lecture&&!item.exception&&['upcoming','current','awaiting'].includes(item.status));
      if(!remaining.length){
        toast('No remaining classes today to mark as No Class.','info');
        return;
      }
      openMarkRemainingBreakDialog(remaining,dateKey);
    };
  }
}

function openMarkRemainingBreakDialog(remainingItems,dateKey){
  const m=modal({
    title:'Mark Remaining Classes as No Class',
    body:`<p>The following <strong>${remainingItems.length} class(es)</strong> scheduled for today (${esc(dateKey)}) will be marked as <strong>No Class / Break</strong>. Existing attendance records and your recurring weekly timetable will not be changed.</p><ul style="margin:12px 0 16px 20px;line-height:1.6">${remainingItems.map(item=>`<li><strong>${esc(item.subject?.subject_name||'Class')}</strong> (${esc(item.displayTime)} · Section ${esc(item.slot.section)})</li>`).join('')}</ul><div class="field"><label>Reason</label><textarea class="input" id="remainingBreakReason" rows="2" placeholder="e.g. University closed early / Bad weather / Department event" required></textarea></div>`,
    actions:`<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" data-confirm><i class="bi bi-pause-circle"></i> Confirm No Class</button>`
  });
  $('[data-cancel]',m.el).onclick=m.close;
  $('[data-confirm]',m.el).onclick=async()=>{
    const reason=$('#remainingBreakReason',m.el).value.trim()||'University closed / Break';
    const defaultSectionId=appData.profile?.section_id||'00000000-0000-0000-0000-000000000001';
    try{
      for(const item of remainingItems){
        await DB.addScheduleException({
          section_id:item.slot.section_id||defaultSectionId,
          schedule_slot_id:item.slot.id,
          exception_date:dateKey,
          exception_type:'break',
          reason
        });
      }
      rawData=await DB.all();
      m.close();
      render(rawData);
      toast(`Marked ${remainingItems.length} remaining class(es) as No Class.`);
    }catch(e){toast(e.message||'Failed to save exception.','error')}
  };
}

export function openExceptionDialog(slot,defaultDate=localDateKey()){
  const subject=appData.subjects.find(s=>s.id===slot.subject_id);
  const existingExceptions=(appData.schedule_exceptions||[]).filter(ex=>ex.schedule_slot_id===slot.id);
  const m=modal({
    title:`Schedule Exception: ${esc(subject?.subject_name||'Class')}`,
    body:`<div class="notice" style="margin-bottom:14px"><div><strong>Section ${esc(slot.section)} · ${esc(shortTime(slot.start_time))}–${esc(shortTime(slot.end_time))}</strong><br><span>Apply a one-day schedule exception without permanently changing the weekly timetable.</span></div></div><form id="exceptionForm" class="form-grid"><div class="field full-width"><label>Exception Date</label><input class="input" type="date" name="exception_date" value="${defaultDate}" required></div><div class="field full-width"><label>Exception Type</label><select class="select" name="exception_type" id="exceptionTypeSelect"><option value="cancelled">Cancelled (Class will not take place)</option><option value="break">No Class / Break (Holiday / unexpected closure)</option><option value="rescheduled">Rescheduled (Move to a different date & time)</option></select></div><div id="rescheduleFields" style="display:none" class="full-width"><div class="form-grid" style="padding:12px;background:#f8faff;border:1px solid #c7d2fe;border-radius:8px"><div class="field"><label>New Date</label><input class="input" type="date" name="new_date" value="${defaultDate}"></div><div class="field"><label>New Room <span class="muted">optional</span></label><input class="input" name="new_room" value="${esc(slot.room||'')}" placeholder="e.g. EE-101"></div><div class="field"><label>New Start Time</label><input class="input" type="time" name="new_start_time" value="${shortTime(slot.start_time)}"></div><div class="field"><label>New End Time</label><input class="input" type="time" name="new_end_time" value="${shortTime(slot.end_time)}"></div></div></div><div class="field full-width"><label>Reason <span class="muted">optional</span></label><textarea class="input" name="reason" rows="2" placeholder="e.g. Teacher unavailable / Moved to lab session"></textarea></div></form>${existingExceptions.length?`<div style="margin-top:16px"><label style="font-weight:700;display:block;margin-bottom:8px">Active Exceptions for this Slot</label>${existingExceptions.map(ex=>`<div class="schedule-exception-item"><div><span class="schedule-exception-badge ${ex.exception_type}">${ex.exception_type}</span> <strong style="margin-left:6px">${ex.exception_date}</strong>${ex.exception_type==='rescheduled'?` <span class="muted">➔ ${ex.new_date} (${shortTime(ex.new_start_time)})</span>`:''}${ex.reason?`<div class="muted" style="font-size:.78rem;margin-top:2px">${esc(ex.reason)}</div>`:''}</div><button class="btn btn-outline btn-sm" data-delete-ex="${ex.id}" type="button"><i class="bi bi-trash"></i></button></div>`).join('')}</div>`:''}`,
    actions:`<button class="btn btn-outline" data-cancel>Cancel</button><button class="btn btn-primary" data-save><i class="bi bi-check2-circle"></i> Save Exception</button>`
  });

  $('[data-cancel]',m.el).onclick=m.close;
  const typeSelect=$('#exceptionTypeSelect',m.el);
  const rescheduleFields=$('#rescheduleFields',m.el);

  typeSelect.onchange=()=>{
    rescheduleFields.style.display=typeSelect.value==='rescheduled'?'block':'none';
  };

  $$('[data-delete-ex]',m.el).forEach(btn=>{
    btn.onclick=async()=>{
      if(!await confirmBox('Remove this exception? The class will return to normal.'))return;
      try{
        await DB.deleteScheduleException(btn.dataset.deleteEx);
        rawData=await DB.all();
        m.close();
        render(rawData);
        toast('Exception removed.');
      }catch(e){toast(e.message||'Failed to delete exception.','error')}
    };
  });

  $('[data-save]',m.el).onclick=async()=>{
    const form=$('#exceptionForm',m.el);
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
    const defaultSectionId=appData.profile?.section_id||'00000000-0000-0000-0000-000000000001';
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
      rawData=await DB.all();
      m.close();
      render(rawData);
      toast('Schedule exception saved.');
    }catch(e){toast(e.message||'Failed to save exception.','error')}
  };
}

function stat(icon,label,value,accent,tint){
  return `<article class="card stat-card" style="--accent:${accent};--tint:${tint}"><div class="stat-label">${label}</div><div class="stat-value"><span class="stat-icon"><i class="bi ${icon}"></i></span><span>${value}</span></div></article>`;
}

function drawCharts(subjectRows,data){
  if(!window.Chart)return;
  Chart.defaults.font.family='DM Sans';
  Chart.defaults.color='#718096';
  new Chart($('#subjectChart'),{
    type:'bar',
    data:{
      labels:subjectRows.map(item=>item.subject.subject_code),
      datasets:[{data:subjectRows.map(item=>item.percentage),backgroundColor:subjectRows.map((item,index)=>index===0?'#1677ff':'#8fc0ff'),borderRadius:7,borderSkipped:false}]
    },
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:context=>`${context.raw}%`}}},scales:{y:{beginAtZero:true,max:100,ticks:{callback:value=>`${value}%`},grid:{color:'#edf1f6'}},x:{grid:{display:false}}}}
  });
  const lectures=[...data.lectures].sort((a,b)=>a.lecture_date.localeCompare(b.lecture_date)).slice(-12);
  new Chart($('#trendChart'),{
    type:'line',
    data:{
      labels:lectures.map(item=>new Date(`${item.lecture_date}T00:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric'})),
      datasets:[{data:lectures.map(lecture=>{const rows=data.attendance.filter(item=>item.lecture_id===lecture.id);return attendanceStats(rows,data.settings?.leave_calculation_policy).percentage}),borderColor:'#1677ff',backgroundColor:'rgba(22,119,255,.1)',fill:true,tension:.38,pointRadius:4,pointBackgroundColor:'#fff',pointBorderWidth:2}]
    },
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,max:100,ticks:{callback:value=>`${value}%`},grid:{color:'#edf1f6'}},x:{grid:{display:false}}}}
  });
}
