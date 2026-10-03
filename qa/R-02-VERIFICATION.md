# R-02 verification

Each student is evaluated using their own section settings.

Root cause: ui.js used data.settings for every lecture/student percentage; dashboard, reports and exports compared all students to the active/default threshold. DB.all already returns settings_rows, so no database or settings-management changes are required. access-context preserves those rows in scoped datasets. export-utils consumes supplied percentages and lectureStats summaries.

Policy: getSectionAttendancePolicy resolves settings_rows by section_id. Missing rows retain 75% minimum and exclude_leave. Student calculations use current student.section_id; history calculations use lecture.section_id. Historical marks are unchanged. Transfer/history policy R-03 is outside this change.

Combined totals: raw counts remain valid. A percentage is shown only when the included marks use a common leave policy. Otherwise dashboard/report percentages say Section-specific and combined subject-chart bars are omitted with an explanatory note. Combined warning labels say Below section requirement / Threshold: Section-specific. Mixed exports suppress the common summary and minimum label; calculated student rows include Minimum Attendance, Leave Policy and Requirement Status. Single-section layouts retain their existing columns.

Disposable QA: in-memory fixtures, two sections A=80/exclude_leave and B=90/count_leave_as_absent; 3 Present, 1 Absent, 2 Leave gives A=75%, B=50%. Equal 82% gives A meets / B below and combined shortage count 1. No live database writes.

Verification: automated module execution and rendered HTML through a stub DOM. Dashboard A/B/All Sections, reports student/subject/short, history render and lecture math, report CSV bytes and export-page row/options all checked. Specific-section and CR policy checks pass. Excel/PDF consume the same tested rows/options; actual downloaded Excel/PDF files and live browser/Supabase integration were not exercised.

Command: node --experimental-vm-modules --test tests/qa.test.cjs
Result: 22 passed, 0 failed. This checkout contained 17 baseline tests, all preserved, plus 5 R-02 tests; the supplied 20-test baseline is not present here.

Files: js/attendance-math.js, js/ui.js, js/dashboard.js, js/reports.js, js/history.js, js/exports.js, tests/qa.test.cjs, qa/R-02-VERIFICATION.md.

Pre-existing modifications in supabase/diagnostics/qa-integrity.sql and migration 070 are excluded from the commit.
