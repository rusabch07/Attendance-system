import {$,$$,esc,modal} from './ui.js';

const STORAGE_KEY_GROUP = 'attendance_admin_group_filter';
const STORAGE_KEY_SECTION = 'attendance_admin_section_filter';

export function getStoredAdminGroup() {
  return sessionStorage.getItem(STORAGE_KEY_GROUP) || '';
}

export function getStoredAdminSection() {
  return sessionStorage.getItem(STORAGE_KEY_SECTION) || 'all';
}

export function setStoredAdminGroup(groupId) {
  if (groupId) {
    sessionStorage.setItem(STORAGE_KEY_GROUP, groupId);
  } else {
    sessionStorage.removeItem(STORAGE_KEY_GROUP);
  }
}

export function setStoredAdminSection(sectionId) {
  if (sectionId) {
    sessionStorage.setItem(STORAGE_KEY_SECTION, sectionId);
  } else {
    sessionStorage.setItem(STORAGE_KEY_SECTION, 'all');
  }
}

export function clearAdminFilterContext() {
  sessionStorage.removeItem(STORAGE_KEY_GROUP);
  sessionStorage.removeItem(STORAGE_KEY_SECTION);
}

/**
 * Derives the active user context for the application.
 * Admin context is controlled by persistent admin filters (stored in sessionStorage).
 * CR context is strictly and immutably determined by profile.section_id.
 */
export function getCurrentUserContext(data) {
  const profile = data?.profile || {};
  const role = (profile.role === 'admin') ? 'admin' : 'cr';
  const isAdmin = role === 'admin';
  const isCR = !isAdmin;

  const academicGroups = Array.isArray(data?.academic_groups) && data.academic_groups.length
    ? data.academic_groups
    : [{
        id: 'ag-default',
        department: data?.settings?.class_name?.split(' ')[0] || 'Electrical Engineering',
        batch: data?.settings?.class_name?.match(/\d{4}/)?.[0] || '2025',
        semester: data?.settings?.semester_name || 'Semester 2',
        is_active: true
      }];

  const sections = Array.isArray(data?.sections) && data.sections.length
    ? data.sections
    : [{
        id: profile.section_id || 'sec-default',
        academic_group_id: academicGroups[0].id,
        section_name: 'Section A',
        section_code: 'EE-25-A',
        department: academicGroups[0].department,
        batch: academicGroups[0].batch,
        semester: academicGroups[0].semester,
        login_id: 'EE-25-A',
        is_active: true
      }];

  if (isCR) {
    // CR: strictly bound to profile.section_id
    const crSectionId = profile.section_id;
    let crSection = sections.find(s => s.id === crSectionId);
    if (!crSection && sections.length) {
      crSection = sections[0];
    }
    const crGroupId = crSection?.academic_group_id || academicGroups[0]?.id;
    const crGroup = academicGroups.find(g => g.id === crGroupId) || academicGroups[0];

    const sectionCode = crSection?.section_code || crSection?.section_name || 'EE-25-A';
    const batch = crSection?.batch || crGroup?.batch || '2025';
    const semester = crSection?.semester || crGroup?.semester || 'Semester 2';
    const department = crSection?.department || crGroup?.department || 'Electrical Engineering';

    return {
      role: 'cr',
      isAdmin: false,
      isCR: true,
      profile,
      activeSectionId: crSection?.id || null,
      activeSection: crSection || null,
      activeSectionCode: sectionCode,
      activeGroupId: crGroupId,
      activeGroup: crGroup,
      isAllSections: false,
      availableSections: crSection ? [crSection] : [],
      availableGroups: crGroup ? [crGroup] : academicGroups,
      topbarRoleBadge: `CR — ${sectionCode}`,
      contextBadge: `${sectionCode} | ${batch} | ${semester}`,
      fullContextTitle: `${sectionCode} | ${batch} | ${semester} | ${department}`
    };
  }

  // Admin: global access with filters
  let storedGroupId = getStoredAdminGroup();
  let activeGroup = academicGroups.find(g => g.id === storedGroupId);
  if (!activeGroup) {
    activeGroup = academicGroups[0];
    storedGroupId = activeGroup ? activeGroup.id : '';
  }

  const groupSections = sections.filter(s => !activeGroup || s.academic_group_id === activeGroup.id);
  let storedSectionId = getStoredAdminSection();
  let isAllSections = storedSectionId === 'all' || !storedSectionId;
  let activeSection = null;

  if (!isAllSections) {
    activeSection = groupSections.find(s => s.id === storedSectionId) || null;
    if (!activeSection) {
      isAllSections = true;
      storedSectionId = 'all';
    }
  }

  const groupLabel = activeGroup ? `${activeGroup.department} - ${activeGroup.batch} - ${activeGroup.semester}` : 'All Departments';
  const sectionCode = activeSection ? (activeSection.section_code || activeSection.section_name) : 'All Sections';

  return {
    role: 'admin',
    isAdmin: true,
    isCR: false,
    profile,
    activeSectionId: isAllSections ? null : activeSection?.id,
    activeSection,
    activeSectionCode: isAllSections ? 'All Sections' : sectionCode,
    activeGroupId: activeGroup?.id || null,
    activeGroup,
    isAllSections,
    availableSections: groupSections,
    availableGroups: academicGroups,
    topbarRoleBadge: isAllSections ? 'Admin' : `Admin | ${sectionCode}`,
    contextBadge: isAllSections ? `${groupLabel} (All Sections)` : `${sectionCode} | ${activeGroup?.batch || ''} | ${activeGroup?.semester || ''}`,
    fullContextTitle: `${groupLabel} · ${sectionCode}`
  };
}

/**
 * Filter an array of items (students, timetable slots, lectures, leaves)
 * according to the active context.
 */
export function filterByActiveContext(items, context, data) {
  if (!Array.isArray(items)) return [];

  // CR mode: must strictly match CR's section
  if (context.isCR) {
    const secId = context.activeSectionId;
    const secCode = context.activeSection?.section_code;
    const secLetter = context.activeSection?.section_name?.match(/Section\s+([A-Za-z0-9]+)/i)?.[1];

    return items.filter(item => {
      if (item.section_id && secId) return item.section_id === secId;
      if (item.section && secCode && item.section === secCode) return true;
      if (item.section && secLetter && item.section === secLetter) return true;
      return false;
    });
  }

  // Admin mode: if specific section is selected
  if (!context.isAllSections && context.activeSection) {
    const secId = context.activeSection.id;
    const secCode = context.activeSection.section_code;
    const secLetter = context.activeSection.section_name?.match(/Section\s+([A-Za-z0-9]+)/i)?.[1];

    return items.filter(item => {
      if (item.section_id && secId) return item.section_id === secId;
      if (item.section && secCode && item.section === secCode) return true;
      if (item.section && secLetter && item.section === secLetter) return true;
      return false;
    });
  }

  // Admin mode: All Sections within the selected academic group
  if (context.activeGroupId && data?.sections) {
    const groupSectionIds = new Set(
      data.sections.filter(s => s.academic_group_id === context.activeGroupId).map(s => s.id)
    );
    const groupSectionCodes = new Set(
      data.sections.filter(s => s.academic_group_id === context.activeGroupId).map(s => s.section_code)
    );

    return items.filter(item => {
      if (item.section_id) return groupSectionIds.has(item.section_id);
      if (item.section && (groupSectionCodes.has(item.section) || groupSectionCodes.size === 0)) return true;
      return true;
    });
  }

  return items;
}

/**
 * Get readable Section label for a row/item (e.g. 'EE-25-A' or 'Section A').
 */
export function getSectionLabel(item, data) {
  if (!item) return '—';
  if (item.section_id && Array.isArray(data?.sections)) {
    const sec = data.sections.find(s => s.id === item.section_id);
    if (sec) return sec.section_code || sec.section_name;
  }
  if (item.section) {
    // Check if item.section matches a section code
    if (Array.isArray(data?.sections)) {
      const match = data.sections.find(s => s.section_code === item.section || s.section_name === `Section ${item.section}`);
      if (match) return match.section_code;
    }
    return item.section.startsWith('EE-') ? item.section : `Section ${item.section}`;
  }
  return '—';
}

/**
 * Render the Admin View Control bar with Academic Group and Section dropdowns.
 * Only rendered for Admin.
 */
export function renderAdminFilterBar(container, data, onFilterChange) {
  const context = getCurrentUserContext(data);
  if (!context.isAdmin) return;

  const html = `
    <div class="admin-context-bar card">
      <div class="admin-context-info">
        <div class="admin-context-badge"><i class="bi bi-shield-shaded"></i> Admin View Control</div>
        <p class="admin-context-sub">Viewing ${esc(context.fullContextTitle)}</p>
      </div>
      <div class="admin-context-controls">
        <div class="field">
          <label for="adminGroupSelect">Academic Group</label>
          <select class="select" id="adminGroupSelect">
            ${context.availableGroups.map(g => `
              <option value="${esc(g.id)}" ${g.id === context.activeGroupId ? 'selected' : ''}>
                ${esc(g.department)} - ${esc(g.batch)} - ${esc(g.semester)}
              </option>
            `).join('')}
          </select>
        </div>
        <div class="field">
          <label for="adminSectionSelect">Section</label>
          <select class="select" id="adminSectionSelect">
            <option value="all" ${context.isAllSections ? 'selected' : ''}>All Sections</option>
            ${context.availableSections.map(s => `
              <option value="${esc(s.id)}" ${(!context.isAllSections && s.id === context.activeSectionId) ? 'selected' : ''}>
                ${esc(s.section_name)} (${esc(s.section_code)})
              </option>
            `).join('')}
          </select>
        </div>
      </div>
    </div>
  `;

  if (typeof container === 'string') {
    const el = $(container);
    if (el) el.insertAdjacentHTML('afterbegin', html);
  } else if (container && container.insertAdjacentHTML) {
    container.insertAdjacentHTML('afterbegin', html);
  }

  const groupSelect = $('#adminGroupSelect');
  const sectionSelect = $('#adminSectionSelect');

  if (groupSelect) {
    groupSelect.onchange = () => {
      setStoredAdminGroup(groupSelect.value);
      // Reset section filter when academic group changes
      setStoredAdminSection('all');
      if (typeof onFilterChange === 'function') onFilterChange();
    };
  }

  if (sectionSelect) {
    sectionSelect.onchange = () => {
      setStoredAdminSection(sectionSelect.value);
      if (typeof onFilterChange === 'function') onFilterChange();
    };
  }
}

/**
 * Modal shown when Admin tries to Take Attendance in All Sections mode.
 */
export function showSectionRequiredModal(data, onSectionSelected) {
  const context = getCurrentUserContext(data);
  const sections = context.availableSections || [];

  const m = modal({
    title: 'Select a Section to Take Attendance',
    body: `
      <div class="schedule-exception-blocked-card" style="margin: 0 auto; text-align: left;">
        <div class="amber-visual" style="margin: 0 auto 16px;"><i class="bi bi-exclamation-triangle"></i></div>
        <p style="font-size: 1rem; color: var(--ink); line-height: 1.5; margin-bottom: 16px; text-align: center;">
          <strong>Attendance belongs to one specific section.</strong><br>
          Please select a specific section before taking attendance. Attendance cannot be taken while 'All Sections' is selected.
        </p>
        <div style="display: grid; gap: 10px; margin-top: 18px;">
          ${sections.map(s => `
            <button class="btn btn-outline" style="justify-content: space-between; padding: 12px 18px; height: auto;" data-pick-section="${esc(s.id)}">
              <span><strong>${esc(s.section_name)}</strong> <span class="muted">(${esc(s.section_code)})</span></span>
              <i class="bi bi-arrow-right"></i>
            </button>
          `).join('')}
        </div>
      </div>
    `,
    actions: `<button class="btn btn-outline" data-close-sec>Cancel</button>`
  });

  $('[data-close-sec]', m.el).onclick = m.close;

  $$('[data-pick-section]', m.el).forEach(btn => {
    btn.onclick = () => {
      const secId = btn.dataset.pickSection;
      setStoredAdminSection(secId);
      m.close();
      if (typeof onSectionSelected === 'function') {
        onSectionSelected(secId);
      }
    };
  });
}
