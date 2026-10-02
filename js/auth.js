import {DB} from './supabase.js';
import {$,$$,esc,pageLink} from './ui.js';

export async function renderLogin(){
  const root=$('#app');
  if(await DB.session()){
    location.href=pageLink('dashboard');
    return;
  }

  root.innerHTML=`
    <div class="role-login-page">
      <header class="role-login-header">
        <div class="role-login-brand">
          <span class="role-login-logo"><i class="bi bi-mortarboard-fill"></i></span>
          <div class="role-login-brand-text">
            <span class="brand-eyebrow">CLASS ATTENDANCE SYSTEM</span>
            <h1>Choose Login Type</h1>
            <p>Select your authorized role to access the attendance system.</p>
          </div>
        </div>
      </header>

      ${!DB.configured&&!DB.demo?`
        <div class="config-warning" style="max-width:960px;margin:0 auto 20px;">
          <strong>Setup required.</strong> Add your Supabase project URL and anon key in <code>js/config.js</code>, or open the interactive demo below.
          <div style="margin-top:8px">
            <a class="btn btn-soft btn-sm" href="login.html?demo=1"><i class="bi bi-play-circle"></i> Open interactive demo</a>
          </div>
        </div>
      `:''}

      <main class="role-login-cards">
        <!-- ADMIN LOGIN CARD -->
        <article class="role-login-card admin-card">
          <div class="role-card-header">
            <div class="role-card-icon admin"><i class="bi bi-shield-shaded"></i></div>
            <div class="role-card-titles">
              <span class="role-tag admin">Department / Faculty</span>
              <h2>ADMIN LOGIN</h2>
            </div>
          </div>
          <p class="role-card-desc">Access all academic groups, sections, faculty schedules, and comprehensive attendance reports.</p>

          <form id="adminLoginForm" class="role-login-form">
            <div id="adminError"></div>
            <div class="field">
              <label for="adminIdentifier">Email or Admin ID</label>
              <div class="input-wrap">
                <i class="bi bi-person-badge"></i>
                <input class="input" id="adminIdentifier" name="identifier" type="text" autocomplete="username" placeholder="admin@university.edu or Admin ID" required>
              </div>
            </div>

            <div class="field" style="margin-top:14px">
              <label for="adminPassword">Password</label>
              <div class="input-wrap">
                <i class="bi bi-lock"></i>
                <input class="input" id="adminPassword" name="password" type="password" autocomplete="current-password" placeholder="Enter your password" required>
                <button type="button" class="password-toggle" data-toggle-pass="adminPassword" aria-label="Toggle password visibility"><i class="bi bi-eye"></i></button>
              </div>
            </div>

            <button class="btn btn-primary role-login-btn" type="submit" ${!DB.isReady?'disabled':''}>
              <i class="bi bi-shield-lock"></i> Login as Admin
            </button>
          </form>

          ${DB.demo?`
            <div class="demo-hint-box">
              <span class="demo-hint-title"><i class="bi bi-stars"></i> Demo Admin Account</span>
              <code>admin@university.edu</code> (any password)
            </div>
          `:''}
        </article>

        <!-- CR LOGIN CARD -->
        <article class="role-login-card cr-card">
          <div class="role-card-header">
            <div class="role-card-icon cr"><i class="bi bi-person-check-fill"></i></div>
            <div class="role-card-titles">
              <span class="role-tag cr">Section Representative</span>
              <h2>CR LOGIN</h2>
            </div>
          </div>
          <p class="role-card-desc">Mark section attendance, review student rosters, and log exceptions for your assigned class.</p>

          <form id="crLoginForm" class="role-login-form">
            <div id="crError"></div>
            <div class="field">
              <label for="crIdentifier">Section Login ID</label>
              <div class="input-wrap">
                <i class="bi bi-mortarboard"></i>
                <input class="input" id="crIdentifier" name="identifier" type="text" autocomplete="username" placeholder="EE-25-A" required>
              </div>
              <small class="field-hint">e.g. <code>EE-25-A</code> or your section login identifier</small>
            </div>

            <div class="field" style="margin-top:14px">
              <label for="crPassword">Password</label>
              <div class="input-wrap">
                <i class="bi bi-lock"></i>
                <input class="input" id="crPassword" name="password" type="password" autocomplete="current-password" placeholder="Enter your password" required>
                <button type="button" class="password-toggle" data-toggle-pass="crPassword" aria-label="Toggle password visibility"><i class="bi bi-eye"></i></button>
              </div>
            </div>

            <button class="btn btn-primary role-login-btn cr-btn" type="submit" ${!DB.isReady?'disabled':''}>
              <i class="bi bi-person-check"></i> Login as CR
            </button>
          </form>

          ${DB.demo?`
            <div class="demo-hint-box">
              <span class="demo-hint-title"><i class="bi bi-stars"></i> Demo CR Accounts</span>
              <code>EE-25-A</code> (Section A) &nbsp;|&nbsp; <code>EE-25-B</code> (Section B)
            </div>
          `:''}
        </article>
      </main>

      <footer class="app-footer role-login-footer">
        <span>&copy; 2026 <strong>Class Attendance System</strong>. All Rights Reserved.</span>
        <span>Designed &amp; Developed by an Electrical Engineering Student</span>
      </footer>
    </div>
  `;

  // Password visibility toggles
  $$('[data-toggle-pass]').forEach(btn => {
    btn.onclick = () => {
      const targetId = btn.dataset.togglePass;
      const input = $(`#${targetId}`);
      if (!input) return;
      const isPass = input.type === 'password';
      input.type = isPass ? 'text' : 'password';
      $('i', btn).className = `bi ${isPass ? 'bi-eye-slash' : 'bi-eye'}`;
    };
  });

  // Admin Login handler
  $('#adminLoginForm').onsubmit = async e => {
    e.preventDefault();
    const btn = e.submitter || $('button[type="submit"]', e.target);
    const errContainer = $('#adminError');
    errContainer.innerHTML = '';
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Signing in as Admin…';

    try {
      const identifier = $('#adminIdentifier').value.trim();
      const password = $('#adminPassword').value;
      await DB.signIn(identifier, password, 'admin');
      location.href = pageLink('dashboard');
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = originalText;
      errContainer.innerHTML = `
        <div class="config-warning login-error" style="margin-bottom:14px">
          <i class="bi bi-exclamation-circle"></i> ${esc(err.message || 'Unable to sign in as Admin.')}
        </div>
      `;
    }
  };

  // CR Login handler
  $('#crLoginForm').onsubmit = async e => {
    e.preventDefault();
    const btn = e.submitter || $('button[type="submit"]', e.target);
    const errContainer = $('#crError');
    errContainer.innerHTML = '';
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="bi bi-arrow-repeat"></i> Signing in as CR…';

    try {
      const identifier = $('#crIdentifier').value.trim();
      const password = $('#crPassword').value;
      await DB.signIn(identifier, password, 'cr');
      location.href = pageLink('dashboard');
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = originalText;
      errContainer.innerHTML = `
        <div class="config-warning login-error" style="margin-bottom:14px">
          <i class="bi bi-exclamation-circle"></i> ${esc(err.message || 'Unable to sign in as CR.')}
        </div>
      `;
    }
  };
}
