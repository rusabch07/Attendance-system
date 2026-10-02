import {DB} from './supabase.js';
import {$,esc,subjectStats,studentSubjectRows,pct} from './ui.js';
import {localDateKey,weekdayNumber,shortTime,scheduleStatus} from './schedule.js';

export async function render(data){
 const threshold=Number(data.settings?.minimum_attendance||75);
 const totalLectures=data.lectures.length;
 const present=data.attendance.filter(item=>item.status==='present').length;
 const avg=pct(present,data.attendance.length);
 const today=localDateKey();
 const subjectRows=data.subjects.map(subject=>({subject,...subjectStats(data,subject.id)}));
 const short=studentSubjectRows(data).filter(item=>item.percentage<threshold).sort((a,b)=>a.percentage-b.percentage);
 $('#page').innerHTML=`<div class="page-heading"><div><h1>Class Overview</h1><p>Live attendance health across your class.</p></div><a class="btn btn-primary" href="attendance.html${DB.qs}"><i class="bi bi-calendar2-check"></i> Take Attendance</a></div><div class="stats-grid">${stat('bi-people-fill','Total Students',data.students.length,'#1677ff','#e6f1ff')}${stat('bi-journals','Total Subjects',data.subjects.length,'#7857d8','#f0ebff')}${stat('bi-calendar2-week-fill','Total Lectures',totalLectures,'#ef4d58','#ffe9eb')}${stat('bi-graph-up-arrow','Average Attendance',`${avg}%`,'#0b9852','#e3f8ed')}${stat('bi-calendar2-day-fill',"Today's Lectures",data.lectures.filter(item=>item.lecture_date===today).length,'#e89b17','#fff4d9')}${stat('bi-exclamation-triangle-fill',`Below ${threshold}%`,short.length,'#ef4444','#ffe8e9')}</div><div class="dashboard-grid"><article class="card table-card full-span today-schedule"><div class="table-head schedule-head"><div><h2><i class="bi bi-calendar2-week"></i> Today's Schedule</h2><span class="muted" id="scheduleDate"></span></div><a href="timetable.html${DB.qs}" class="schedule-link">View Full Timetable <i class="bi bi-arrow-right"></i></a></div><div class="table-wrap"><table class="data-table schedule-table"><thead><tr><th>Time</th><th>Subject</th><th>Room</th><th>Status</th><th>Action</th></tr></thead><tbody id="todayScheduleRows"></tbody></table></div></article><article class="card chart-card"><div class="chart-head"><h2>Subject-wise Attendance</h2><span class="muted">Average %</span></div><div class="chart-wrap"><canvas id="subjectChart"></canvas></div></article><article class="card chart-card"><div class="chart-head"><h2>Attendance Trend</h2><span class="muted">Recent lectures</span></div><div class="chart-wrap"><canvas id="trendChart"></canvas></div></article><article class="card table-card full-span"><div class="table-head"><h2>Students Below ${threshold}%</h2><a href="reports.html${DB.qs}" class="btn btn-soft btn-sm">View report</a></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Roll No</th><th>Student Name</th><th>Subject</th><th>Present / Total</th><th>Attendance</th></tr></thead><tbody>${short.slice(0,8).map(item=>`<tr><td><strong>${esc(item.student.roll_no)}</strong></td><td>${esc(item.student.name)}</td><td>${esc(item.subject.subject_name)}</td><td>${item.present} / ${item.total}</td><td><strong class="text-danger">${item.percentage}%</strong></td></tr>`).join('')||`<tr><td colspan="5"><div class="empty"><i class="bi bi-emoji-smile"></i>No students are below the requirement.</div></td></tr>`}</tbody></table></div></article></div>`;
 renderTodaySchedule(data);
 drawCharts(subjectRows,data);
 window.setInterval(()=>renderTodaySchedule(data),30_000);
}

function renderTodaySchedule(data){
 const now=new Date();
 const dateKey=localDateKey(now);
 const slots=data.timetable.filter(slot=>slot.is_active!==false&&Number(slot.day_of_week)===weekdayNumber(now)).sort((a,b)=>String(a.start_time).localeCompare(String(b.start_time)));
 const dateNode=$('#scheduleDate');
 const rowsNode=$('#todayScheduleRows');
 if(!dateNode||!rowsNode)return;
 dateNode.textContent=new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'2-digit',month:'short',year:'numeric'}).format(now);
 rowsNode.innerHTML=slots.map(slot=>{
  const subject=data.subjects.find(item=>item.id===slot.subject_id);
  const lecture=data.lectures.find(item=>item.schedule_slot_id===slot.id&&item.lecture_date===dateKey);
  const status=lecture?'taken':scheduleStatus(slot,now,false);
  return `<tr><td class="schedule-time">${shortTime(slot.start_time)}–${shortTime(slot.end_time)}</td><td><strong>${esc(subject?.subject_name||'Unknown subject')}</strong><small>${esc(slot.section)}</small></td><td>${esc(slot.room||'—')}</td><td>${scheduleBadge(status)}</td><td>${scheduleAction(slot,lecture,status,dateKey)}</td></tr>`;
 }).join('')||`<tr><td colspan="5"><div class="empty schedule-empty"><i class="bi bi-calendar2"></i><strong>No classes scheduled today</strong><span>Use the timetable page to add a weekly class slot.</span></div></td></tr>`;
}

function scheduleBadge(status){
 const labels={upcoming:'Upcoming',current:'Current',completed:'Completed',awaiting:'Awaiting Attendance',taken:'Attendance Taken'};
 const icons={upcoming:'bi-clock-fill',current:'bi-record-circle-fill',completed:'bi-check-circle-fill',awaiting:'bi-exclamation-circle-fill',taken:'bi-check-circle-fill'};
 return `<span class="schedule-status ${status}"><i class="bi ${icons[status]}"></i>${labels[status]}</span>`;
}

function scheduleAction(slot,lecture,status,dateKey){
 if(lecture)return `<a class="btn btn-outline btn-sm schedule-action" href="history.html${DB.qs}#${encodeURIComponent(lecture.id)}">View</a>`;
 if(status==='upcoming')return '<span class="muted">—</span>';
 const params=new URLSearchParams();
 if(DB.demo)params.set('demo','1');
 params.set('subject',slot.subject_id);
 params.set('section',slot.section);
 params.set('date',dateKey);
 params.set('slot',slot.id);
 return `<a class="btn btn-primary btn-sm schedule-action" href="attendance.html?${params.toString()}">Take Attendance</a>`;
}

function stat(icon,label,value,accent,tint){return `<article class="card stat-card" style="--accent:${accent};--tint:${tint}"><div class="stat-label">${label}</div><div class="stat-value"><span class="stat-icon"><i class="bi ${icon}"></i></span><span>${value}</span></div></article>`}

function drawCharts(subjectRows,data){
 if(!window.Chart)return;
 Chart.defaults.font.family='DM Sans';
 Chart.defaults.color='#718096';
 new Chart($('#subjectChart'),{type:'bar',data:{labels:subjectRows.map(item=>item.subject.subject_code),datasets:[{data:subjectRows.map(item=>item.percentage),backgroundColor:subjectRows.map((item,index)=>index===0?'#1677ff':'#8fc0ff'),borderRadius:7,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:context=>`${context.raw}%`}}},scales:{y:{beginAtZero:true,max:100,ticks:{callback:value=>`${value}%`},grid:{color:'#edf1f6'}},x:{grid:{display:false}}}}});
 const lectures=[...data.lectures].sort((a,b)=>a.lecture_date.localeCompare(b.lecture_date)).slice(-12);
 new Chart($('#trendChart'),{type:'line',data:{labels:lectures.map(item=>new Date(`${item.lecture_date}T00:00:00`).toLocaleDateString('en-US',{month:'short',day:'numeric'})),datasets:[{data:lectures.map(lecture=>{const rows=data.attendance.filter(item=>item.lecture_id===lecture.id);return pct(rows.filter(item=>item.status==='present').length,rows.length)}),borderColor:'#1677ff',backgroundColor:'rgba(22,119,255,.1)',fill:true,tension:.38,pointRadius:4,pointBackgroundColor:'#fff',pointBorderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,max:100,ticks:{callback:value=>`${value}%`},grid:{color:'#edf1f6'}},x:{grid:{display:false}}}}});
}
