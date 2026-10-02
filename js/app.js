import {DB} from './supabase.js';
import {renderLogin} from './auth.js';
import {pageLink,$,esc} from './ui.js';

const page=document.body.dataset.page;
const nav=[['dashboard','bi-grid-1x2-fill','Dashboard'],['attendance','bi-calendar2-check-fill','Take Attendance'],['history','bi-clock-history','Attendance History'],['students','bi-people-fill','Students'],['subjects','bi-journal-bookmark-fill','Subjects'],['reports','bi-bar-chart-fill','Reports'],['exports','bi-cloud-arrow-down-fill','Export Data'],['settings','bi-gear-fill','Settings']];
const pageTitles={dashboard:'Class Overview',attendance:'Take Attendance',history:'Attendance History',students:'Students',subjects:'Subjects',reports:'Reports',exports:'Export Data',settings:'Settings'};

async function shell(){
 const root=$('#app');root.innerHTML=`<div class="app-shell"><aside class="sidebar" id="sidebar"><a class="brand" href="${pageLink('dashboard')}"><span class="brand-mark"><i class="bi bi-mortarboard-fill"></i></span><span>Attendance System</span></a><nav class="nav-list">${nav.map(n=>`<a class="nav-item ${page===n[0]?'active':''}" href="${pageLink(n[0])}"><i class="bi ${n[1]}"></i><span>${n[2]}</span></a>`).join('')}</nav><div class="sidebar-foot"><button class="logout-link" id="logout"><i class="bi bi-box-arrow-left"></i>&nbsp;&nbsp; Logout</button></div></aside><main class="main"><header class="topbar"><div style="display:flex;align-items:center;gap:12px"><button class="mobile-toggle" id="menuToggle" aria-label="Open navigation"><i class="bi bi-list"></i></button><span class="topbar-title">${pageTitles[page]}</span></div><div class="user-wrap"><span>Welcome, <strong id="userName">CR</strong></span><span class="avatar" id="avatar">CR</span></div></header><section class="page" id="page"><div class="loader"></div></section><footer class="app-footer"><span>&copy; 2026 <strong>Class Attendance System</strong>. All Rights Reserved.</span><span>Designed &amp; Developed by an Electrical Engineering Student</span></footer></main></div>`;
 const clock=document.createElement('time');clock.className='datetime-display';clock.innerHTML='<span class="datetime-date"></span><span class="datetime-time"></span>';$('.user-wrap').prepend(clock);
 const updateClock=()=>{const now=new Date();clock.dateTime=now.toISOString();$('.datetime-date',clock).textContent=new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(now);$('.datetime-time',clock).textContent=new Intl.DateTimeFormat('en-US',{hour:'2-digit',minute:'2-digit',hour12:true}).format(now)};
 updateClock();window.setInterval(updateClock,30_000);
 const sidebar=$('#sidebar');$('#menuToggle').onclick=()=>{sidebar.classList.toggle('open');if(sidebar.classList.contains('open')){const o=document.createElement('div');o.className='sidebar-overlay';o.onclick=()=>{sidebar.classList.remove('open');o.remove()};document.body.append(o)}};
 $('#logout').onclick=async()=>{await DB.signOut();location.href=pageLink('login')};
 const data=await DB.all();const name=data.profile?.name||'Class Representative';$('#userName').textContent=name.split(' ')[0];$('#avatar').textContent=name.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();return data;
}
async function boot(){
 if(page==='login'){renderLogin();return}
 if(!DB.isReady){location.href='login.html';return}
 const session=await DB.session();if(!session){location.href=pageLink('login');return}
 try{const data=await shell();const modules={dashboard:'./dashboard.js',attendance:'./attendance.js',history:'./history.js',students:'./students.js',subjects:'./subjects.js',reports:'./reports.js',exports:'./exports.js',settings:'./settings.js'};const mod=await import(modules[page]);await mod.render(data)}catch(e){console.error(e);$('#page').innerHTML=`<div class="card card-pad"><h2>We couldn't load this page</h2><p class="muted">${esc(e.message||'Please try again.')}</p><button class="btn btn-primary" onclick="location.reload()">Try again</button></div>`}
}
boot();
