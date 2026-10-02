import {DB} from './supabase.js';
import {$,esc,toast} from './ui.js';
import {getCurrentUserContext,renderAdminFilterBar} from './access-context.js';

let data,context;

export async function render(d){
  data=d;
  context=getCurrentUserContext(data);
  draw();
}

function draw(){
  const s=data.settings||{},p=data.profile||{};
  const policy=s.leave_calculation_policy||'exclude_leave';

  $('#page').innerHTML=`
    <div id="adminFilterMount"></div>
    <div class="page-heading">
      <div>
        <h1>Settings</h1>
        <p>Manage your profile, class identity, and attendance policy.</p>
        ${context.isCR ? `
          <div class="cr-context-badge">
            <i class="bi bi-gear-fill"></i> ${esc(context.activeSection?.section_name || 'Section A')} (${esc(context.activeSectionCode)})
          </div>
        ` : ''}
      </div>
    </div>

    <div class="settings-grid">
      <section class="card settings-section">
        <h2>Class & University</h2>
        <form id="classForm" class="form-grid">
          <div class="field"><label>Class Name</label><input class="input" name="class_name" value="${esc(s.class_name||'')}"></div>
          <div class="field"><label>Semester Name</label><input class="input" name="semester_name" value="${esc(s.semester_name||'')}"></div>
          <div class="field"><label>University Name</label><input class="input" name="university_name" value="${esc(s.university_name||'')}"></div>
          <div class="field"><label>Minimum Attendance Requirement (%)</label><input class="input" name="minimum_attendance" type="number" min="1" max="100" value="${s.minimum_attendance||75}" required></div>
          <div class="field full-width">
            <label for="leavePolicy">Leave Calculation Policy</label>
            <select class="select" id="leavePolicy" name="leave_calculation_policy">
              <option value="exclude_leave" ${policy==='exclude_leave'?'selected':''}>Exclude Leave from attendance percentage</option>
              <option value="count_leave_as_absent" ${policy==='count_leave_as_absent'?'selected':''}>Count Leave as Absent</option>
            </select>
          </div>
        </form>
        <div style="margin-top:18px;display:flex;justify-content:flex-end">
          <button class="btn btn-primary" id="saveClass"><i class="bi bi-floppy-fill"></i> Save Class Settings</button>
        </div>
        <div class="notice" style="margin-top:18px">
          <i class="bi bi-info-circle"></i> Dashboard warnings and short-attendance reports automatically use this percentage.
        </div>
      </section>

      <section class="card settings-section">
        <h2>Account</h2>
        <div class="profile-block">
          <div class="profile-avatar">${esc((p.name||(context.isAdmin?'Admin':'CR')).split(' ').map(x=>x[0]).slice(0,2).join(''))}</div>
          <div>
            <strong>${esc(p.name||(context.isAdmin?'Faculty Administrator':'Class Representative'))}</strong><br>
            <span class="status blue">${esc(context.topbarRoleBadge)}</span>
          </div>
        </div>
        <form id="accountForm">
          <div class="field"><label>Display Name</label><input class="input" name="name" value="${esc(p.name||'')}"></div>
          <div class="field" style="margin-top:15px"><label>New Password <span class="muted">optional</span></label><input class="input" name="password" type="password" minlength="8" placeholder="At least 8 characters"></div>
        </form>
        <button class="btn btn-primary" id="saveAccount" style="width:100%;margin-top:18px"><i class="bi bi-shield-check"></i> Update Account</button>
      </section>
    </div>
  `;

  if(context.isAdmin)renderAdminFilterBar($('#adminFilterMount'),data,async()=>{data=await DB.all();context=getCurrentUserContext(data);draw()});
  if(context.isAllSections){$('#saveClass').disabled=true;$('#classForm').querySelectorAll('input,select').forEach(el=>el.disabled=true);$('.notice').textContent='Select a specific section to edit its class settings and attendance policy.';}
  bind();
}

function bind(){
  $('#saveClass').onclick=async()=>{
    const f=$('#classForm');
    if(!f.reportValidity())return;
    const row=Object.fromEntries(new FormData(f));
    row.minimum_attendance=Number(row.minimum_attendance);
    try{
      await DB.saveSettings(row);
      data=await DB.all();
      draw();
      toast('Class settings saved.');
    }catch(e){toast(e.message,'error')}
  };

  $('#saveAccount').onclick=async()=>{
    const f=$('#accountForm');
    if(!f.reportValidity())return;
    const row=Object.fromEntries(new FormData(f));
    try{
      if(row.name)await DB.saveProfile(row.name);
      if(row.password)await DB.changePassword(row.password);
      data=await DB.all();
      context=getCurrentUserContext(data);
      $('#userName').textContent=data.profile.name;
      $('#avatar').textContent=data.profile.name.split(' ').map(x=>x[0]).filter(Boolean).slice(0,2).join('').toUpperCase();
      draw();
      toast('Account updated.');
    }catch(e){toast(e.message,'error')}
  };
}
