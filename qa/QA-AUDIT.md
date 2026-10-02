# Attendance System — full-system QA audit

Audit date: 2 October 2026 (Asia/Karachi). Scope: every application page, JavaScript module, stylesheet, schema, and migration in this repository. Production Supabase was **not modified, seeded, reset, or penetration-tested**. No service-role credentials were requested or used.

## Evidence labels

- **Actually Tested**: executed in the local browser/demo or the Node regression suite. Demo checks do not establish Supabase security.
- **Verified by Code/SQL Review**: the referenced implementation was inspected; deployed database behavior was not executed.
- **Requires Real Supabase Test Environment**: requires an isolated Supabase project and authenticated test accounts. Every such item below **Requires isolated Supabase test environment**.
- **Not Tested**: no successful execution/verification; no pass is claimed.

## A. Overall system status

**Improved, but not a production security or data-integrity sign-off.** All ten application modules render in demo mode. Seventeen dependency-free automated tests pass. Browser workflows, imports, historical editing, role navigation, refresh, and responsive measurements found confirmed defects that were corrected. Outstanding database, concurrency, policy, and export-verification gaps are listed explicitly below.

There was no existing package manifest or automated test framework. A small Node VM-based suite exercises the actual ES modules, isolated in-memory demo stores, and generated data. No heavy framework or dependency installation was introduced.

Evidence:

- `qa/evidence/regression.txt`: executed test results.
- `qa/evidence/responsive.json`: 80 final CR page/viewport measurements.
- `qa/evidence/admin-responsive.json`: 80 final Admin All Sections measurements.
- `qa/evidence/login-responsive.json`: eight login measurements.
- `qa/evidence/mobile-attendance.jpg`: mobile attendance proof of work.

## B. Pages tested

All ten pages below: **Actually Tested**, completed rendering in the browser as Admin and CR A; no captured JavaScript errors in those page-load checks. Responsive measurements cover all ten at eight requested sizes. Loading alone was not treated as workflow verification.

| Page | Additional executed checks | Limitations |
|---|---|---|
| Login | Demo Admin and CR login; case/space normalization; Admin used in CR login rejected; logout/re-login; eight sizes | Real passwords, wrong-password throttling, disabled accounts, password change: isolated environment |
| Dashboard | All Sections baseline: 14 students / 60 lectures; section B baseline: six students; specific-section navigation; saved scheduled lecture becomes Attendance Taken | Production aggregates and differing per-section policies unverified |
| Attendance | Section B roster and Lecture 8; P/A/L; save; repeat-slot block; manual roster; approved Leave survives Copy Previous; cross-section slot URL blocked; historical edit/refreshed status | Server transaction/concurrency behavior unverified |
| Timetable | Add/edit generated Saturday slot; invalid end-before-start blocked; room edits; cancellation and reschedule via modal; delete generated slot | Overlap prevention absent; inactive behavior additionally tested in Node |
| History | Section labels; saved counts 0 P / 5 A / 1 L; configured 90% threshold renders 83.3% red; edit; view entry path; delete generated lectures | Export file download artifacts not independently verified |
| Students | Add/edit/view; refresh persistence; search/empty result; duplicate scenario; CSV and XLSX import; sort toggles; delete QA records | Multi-row import failure/rollback unverified; source review identifies partial writes |
| Leaves | Empty pending list; create and approve demo request; persistence into Attendance; automated approval/rejection and ownership checks | Overlapping-date rejection absent; real approval auditing unverified |
| Subjects | Admin add/edit/delete QA subject; CR add/edit controls absent; automated duplicate/group ownership checks | Second academic group tested synthetically, not through live Supabase |
| Reports | Student/Subject/Below-threshold modes; three format handlers; 90% setting; configured color; rendered counts | Binary XLSX/PDF and browser CSV download contents unverified |
| Export Data | Loading, role context, responsive behavior; shared CSV encoder unit test | Every export scope/format combination was not downloaded and checked |
| Settings | Section B threshold 90%, history follows; restored to 75%; profile name updates topbar; All Sections class editing blocked | Real password change and RLS permissions not executed |

`index.html` redirect and local HTML asset references: **Verified by Code/SQL Review** and automated link existence checks. A real hosting/deployment navigation check is **Not Tested**.

## C. Features tested and requirement coverage

| Requested area | Actually Tested | Verified by Code/SQL Review | Requires Real Supabase Test Environment / Not Tested |
|---|---|---|---|
| 1. Login | Demo normalization, blank/unknown identifiers in Node, role mismatch, re-login | Production uses Supabase Auth; no plaintext password persistence; public publishable key | Correct/wrong real credentials, repeated failures, inactive sections, password changes |
| 2. Security | CR A UI isolation on all ten pages; forged section B URL; demo write guards; no CR subject controls | Profile protection trigger, section/group RLS, client fail-closed profile lookup | Direct authenticated RLS reads/writes; role/section escalation and storage tampering against a deployed DB |
| 3. Admin context | All/A/B navigation, logout clears selection; invalid stored section fallback in Node | Group filter resets section; primary-ID filtering | Second group's live records; policy differences in combined mode |
| 4. Dashboard | Baseline all-section and B counts; scheduled save reflected | Unique below-threshold student count corrected | Production count reconciliation, multiple lectures/student interpretation |
| 5. Today's schedule | Awaiting and Taken UI; cancelled and moved attendance paths; every time boundary/status in Node | Device-local calendar; recurring schedule unaffected | DST/other timezones and real clock turnover |
| 6. Timetable | Add/edit/delete QA slot, invalid range; inactive/group validation in Node | Database valid-time/group triggers | Concurrent overlapping inserts; all role combinations on real DB |
| 7. Exceptions | Browser cancellation and reschedule, attendance on new date; Node upsert/revert | Unique slot/date key; prepared reference guard | SQL trigger execution, conflicting reschedules, same-day reschedule UI (logic test passes) |
| 8. Attendance | P/A/L, save, duplicate slot, copy, old edit, lecture numbers; all-present/all-absent controls exercised | Unique scheduled slot/date index; positive-number validation | Concurrent real clients; network fault/rollback; full bulk-All-Leave browser save |
| 9. Leaves | Browser create/approve/copy preservation; Node approve/reject/date-inclusive preservation | Approved date-range preselection; prepared student/section guard | Overlap policy, historic/future approvals in a real project |
| 10. History | Counts, 90% color, edit/persistence, generated-entry deletion | Hash view restricted to scoped lectures | Every filter combination, XLSX/PDF/CSV file artifact verification |
| 11. Students | CRUD, view/search, sort toggle, CSV/XLSX import, temporary-record cleanup | Import requires selected section; supplied section must match | Real duplicate/update/delete constraints and cascade effects |
| 12. Subjects | Admin CRUD, CR read-only UI; same code/different group Node case | Group-based records and SQL uniqueness; cascade risk | Real cross-group uniqueness/permissions |
| 13. Reports | Three modes; format handlers; counts/threshold | Shared P/A/L calculation helper and export rows | Mixed-section policies; exhaustive filters and artifact comparison |
| 14. Exports | BOM/quotes/newline/raw CSV in Node; report export handlers invoked | Filenames sanitized; XLSX string cells generated via SheetJS | Browser download-event timed out; binary layouts/content **Not Tested** |
| 15. Settings | Threshold persistence/isolation, display-name topbar update | Section-aware fetch/save; duplicate settings fail explicitly | Real password/account permissions; multiple settings rows in live DB |
| 16. Topbar | Seeded names/initials; long display-name update; mobile date/time/role visibility | Clock updates every second, local time | Long-name overflow after profile edit at every viewport **Not Tested** |
| 17. Sidebar | Drawer open/close, outside-overlay close, short-height scrolling/logout bounds | Flex layout pins footer; active page links | Keyboard-only focus/assistive-technology audit **Not Tested** |
| 18. Responsive | Eight specified sizes across ten pages; login eight sizes; mobile modal bounds | Table-local scrolling preserves required schedule columns | Every modal at every size **Not Tested** |
| 19. Integrity | Demo student/lecture ownership, duplicates, cascades/slot cleanup | Full schema/migrations; read-only diagnostic SQL prepared | Existing production data/orphan counts **Not Tested** |
| 20. Navigation | Direct demo URLs, refresh, back/forward, logout/re-login, malformed/cross-section record paths | Optional-table missing-code fallback; startup error catch | Expired real session, missing tables, 4xx/5xx fault injection |
| 21. Errors | Captured browser console on page loads and tested workflows; JS parse/local asset checks | Duplicate lookup/filter callbacks now catch rejections | Comprehensive network request recording and fault injection **Not Tested** |
| 22. Quality | Tests exercise actual module helpers | Reviewed all JS; centralized context; defaults distinguished from hardcoded color thresholds | Unused code exhaustive liveness analysis **Not Tested** |
| 23. Data safety | Only local demo/generated records mutated | No production SQL executed; no service role used | None of the production mutations were attempted |
| 24. Automation | 17 tests pass | No pre-existing suite; lightweight built-in Node test runner | PostgreSQL test runner unavailable; migration not executed |

## D. Bugs found

Severity reflects impact; review-only findings do not imply the current production deployment has been exploited or contains corrupt records.

| ID | Severity | Finding | Evidence / disposition |
|---|---|---|---|
| QA-01 | Medium | Copy Previous overwrote approved Leave | Browser and regression test; fixed |
| QA-02 | Medium | History percentage color hardcoded 75 | Browser with threshold 90; fixed |
| QA-03 | Medium | Generic CSV appended summary rows by default | CSV byte/content regression; fixed |
| QA-04 | High | Attendance lecture numbers used all sections | Browser B Lecture 8 and regression; fixed |
| QA-05 | High | Admin slot opened without binding roster/metadata to slot section | Browser B roster six and code review; fixed |
| QA-06 | High | Unknown CR section fell back to the first section | Context regression; fixed |
| QA-07 | High | Missing authenticated profile could fall back to another profile | Production path code review; fixed, real failure-path test pending |
| QA-08 | High | Admin settings fetched/saved first row regardless of section | Demo settings isolation and code review; fixed |
| QA-09 | Medium | Mark Remaining included past/current classes | Boundary regression; now only not-yet-started classes are eligible |
| QA-10 | Medium | Most demo CRUD reset on navigation; duplicate/ownership behavior diverged | Persistence/duplicate regressions and browser refresh; fixed |
| QA-11 | Low | Demo addTimetableSlot forced inactive input to active | Regression; fixed |
| QA-12 | Medium | Demo deletes left slot/exception references behind | Code review and guard tests; aligned with documented cascades |
| QA-13 | Medium | Attendance counts overflowed phones and roll numbers were hidden | Browser measurement before/after; fixed |
| QA-14 | Medium | Mobile CSS hid essential schedule columns by position | CSS review; essential columns restored with table-local scrolling |
| QA-15 | Low | Mobile date/role/full welcome name were hidden | Screenshot/DOM checks; fixed wrapping |
| QA-16 | Medium | History hash detail lookup bypassed active context in demo | Code review; scoped lookup fixed |
| QA-17 | Low | Main report Export only exported Excel without a format choice | Browser format handlers; explicit CSV/Excel/PDF choice added |
| QA-18 | Medium | Below-threshold dashboard counted student-subject pairs as students | Code review; unique student count fixed |
| QA-19 | Low | Drawer toggle could leave an overlay behind | Browser overlay count/outside close; fixed |
| QA-20 | High | Scheduled attendance accepted arbitrary weekday/date URLs | Browser reproduction and scheduling regression; frontend/demo fixed; DB guard prepared |
| QA-21 | Medium | Same-day reschedule blocked its moved attendance instance | Date helper regression; fixed |
| QA-22 | Medium | Demo logout immediately regained implicit Admin authentication | Node/browser logout/re-login; explicit logged-out state fixed |
| QA-23 | Medium | Import silently assigned All Sections input to first section | Import review; selected section required and conflicting file sections rejected |
| QA-24 | Low | Required identity/reason fields accepted whitespace-only text | Regression; trimmed/blank fields rejected |
| QA-25 | Medium | Startup session rejection / duplicate-query rejection escaped error handling | Code review; catches added; real fault injection pending |
| QA-26 | Low | Close/overlay dismissal left confirmation promises unresolved | Code review; cancel resolution added |
| QA-27 | Low | Sorting reset direction each render, preventing repeat toggling | Browser ascending/descending verification; fixed |
| QA-28 | Low | Display-name save left welcome name/initials stale | Browser name update; fixed |
| QA-29 | High | Editing historical lectures invented Present marks for newly added students | Browser reproduced eight becoming ten, then fixed to eight; regression added |
| QA-30 | High | CR exception RLS checked supplied section but not referenced slot | SQL review; migration prepared, not applied/tested |
| QA-31 | High | Leave RLS checked supplied section but not referenced student | SQL review; migration prepared, not applied/tested |
| QA-32 | High | Admin attendance could join students and lectures from different sections | SQL review; migration prepared, not applied/tested |
| QA-33 | Medium | Profiles required section even for global Admin | SQL review; migration permits null Admin section, requires CR assignment for new writes |
| QA-34 | High | README omitted required exception/login migrations | Documentation corrected, deployment application remains unverified |
| QA-35 | Low | Secondary history/report/export filters stayed incompatible after a primary context switch | Code review; dependent selections reset/validate against new scope |
| QA-36 | High | Inactive section login UI blocked access but existing CR tokens retained scoped DB access | SQL review; active-section RLS helper/policy replacements prepared, not applied/tested |

No **Critical** vulnerability was confirmed by execution. Applying only `schema.sql` without the role-protection/section migrations would leave broad policies and profile-update privileges: a **Critical deployment risk** established by SQL review, not proof of the deployed database state.

## E. Bugs fixed

QA-01 through QA-29, QA-34 and QA-35 are corrected in the repository. Some error/security paths are code-reviewed fixes rather than executed real-Supabase tests. QA-30 through QA-33 and QA-36 have prepared database fixes and must not be described as deployed fixes.

Intended behavior retained: subjects remain shared by academic group; manual extra lectures remain supported; weekly schedules are not permanently altered by date exceptions; approved leaves do not retroactively rewrite saved attendance; student/subject cascade deletion has not been redesigned.

Documented behavior decisions: remaining classes means classes that have not started; historical editing uses the roster recorded for that lecture; import requires a selected section and rejects incompatible Section values; raw CSV summaries require explicit opt-in; mobile schedule details remain accessible via horizontal scrolling inside the table.

## F. Bugs and risks remaining

| ID | Severity | Finding | Why not changed / next step |
|---|---|---|---|
| R-01 | High | Save/update lecture and attendance use separate requests; failed updates can leave partially changed metadata; creation compensation delete can fail | Transactional RPC plus concurrency/fault tests requires an isolated environment and migration design |
| R-02 | High | Admin combined mode has no defined policy for sections with different minimum-attendance/leave settings; defaults can misclassify/compute combined results | Define per-section aggregation rule; test differing policies in isolation; no silent business-rule choice made |
| R-03 | High | Moving a student/subject/section after history exists can invalidate dependent section/group references; new child-row guards do not prevent every parent reassignment | Requires a documented transfer policy and guards on parent mutations; do not auto-rewrite historical data |
| R-04 | Medium | Weekly overlapping slots are accepted; no overlap constraint in SQL or UI | Verify whether legitimate simultaneous slots are permitted before changing scheduling behavior |
| R-05 | High | Multiple original occurrences can be rescheduled to the same slot/new date; existing lecture uniqueness cannot distinguish incoming instances from a recurring instance | Decide occurrence identity model before introducing a schema/UI change |
| R-06 | Medium | Overlapping leave requests are allowed; no explicit overlap/duplicate-date policy | Product policy must specify whether overlap is invalid; no new rejection rule invented |
| R-07 | Medium | Student imports are sequential, so a later failure can leave earlier rows imported | Add preflight/result reporting or an atomic importer after intended all-or-partial behavior is decided |
| R-08 | Medium | Settings have no unique constraint on section_id; duplicate rows make reads ambiguous | Diagnostics detects duplicates; save refuses ambiguous updates; reconcile existing rows before adding uniqueness |
| R-09 | Medium | Public login lookup RPCs reveal account email/name existence | Expected identifier login currently depends on resolution; rate limiting/server-side auth resolution needs an architectural decision |
| R-10 | Medium | Raw CSV values beginning with spreadsheet formula syntax can be interpreted by spreadsheet applications | CSV quoting does not neutralize formulas; choose an explicit safe-spreadsheet export policy without silently altering raw values |
| R-11 | High | Student/subject hard deletes cascade into attendance/history; timetable deletion also removes exceptions | Existing warnings retained; archival redesign expressly outside safe QA fixes |
| R-12 | High | Legacy migration assigns null section IDs to default A regardless of legacy section text | Diagnostic text/ID mismatch query prepared; deployed rows not inspected or auto-remapped |
| R-13 | Medium | Concurrent next-number calculations may allocate the same lecture number on different dates | Existing uniqueness includes date; atomic allocation requires isolated concurrency tests and business-policy clarification |
| R-14 | Medium | Exception edits can mark an already-attended class cancelled or move it; completed rescheduled attendance can outlive an exception revert | Needs history-preservation policy and transactional validation; no data rewriting performed |
| R-15 | Low | Exhaustive filter-state transitions remain unverified after the QA-35 reset fix | Specific reset paths reviewed; every combination still needs UI regression |
| R-16 | Low | CDN dependency major-version aliases are unpinned and lack integrity attributes | Reproducible dependency pinning is a separate deployment change |
| R-17 | High | `table()`/`optionalTable()` use one unpaginated select; server response row limits can truncate large datasets and totals | Test above the isolated project's configured row limit; add stable pagination before large-data sign-off |
| R-18 | Medium | Direct scoped writes can supply audit fields such as created_by/approved_by; replacement lecture RLS no longer checks creator identity | Validate/stamp actor fields server-side after reviewing legitimate Admin correction workflows; frontend stamping is not a DB guarantee |

PDF/XLSX rendering and downloaded-file content are **Not Tested**. Browser export handlers were invoked with no captured errors, but download-event retrieval timed out. This is a verification limitation, not proof exports are broken.

## G. Security issues found

**Verified by Code/SQL Review**:

- Password authentication/change uses Supabase Auth; no password is saved in public tables or demo persistence. The frontend config contains a public publishable key, not a service-role key.
- Migration 040 protects profile role, section, and user identity against non-Admin changes; subjects are Admin-write/CR-read policies; section-bearing tables use section RLS; attendance uses lecture/student scope.
- Existing exception and leave policies needed reference ownership checks (QA-30/31). The prepared guard validates the actual parent record. Attendance integrity is checked even for Admin (QA-32).
- Existing CR tokens previously retained access after section deactivation; prepared SQL checks section activity for scoped data, subjects/groups and attendance (QA-36).
- Missing/invalid production profiles and inactive CR sections now fail closed in `DB.all()`/login. These paths were not run against Supabase.
- Public identifier RPC account enumeration and incomplete-migration deployment risks remain as described in F/D.

Direct RLS access, token expiry, role escalation, changing CR section IDs, and frontend storage tampering against a real authenticated DB: **Requires Real Supabase Test Environment**. Demo UI/storage tests are not substitutes for them.

## H. Data integrity issues

`supabase/diagnostics/qa-integrity.sql` is SELECT-only. It checks missing/mismatched attendance parents, timetable/lecture academic groups, leave/exception parent sections, missing/inactive CR sections, settings sections, subject groups, duplicate settings, reused lecture numbers, overlapping slots, and legacy student text/ID disagreement.

It was **not executed against production**. No assertion is made about whether production contains orphaned or inconsistent records. Foreign keys and existing unique constraints were reviewed; new triggers guard future writes, not historical cleanup. Parent reassignment and transaction concerns remain in F.

## I. Responsive/UI issues

Requested sizes: 1920×1080, 1366×768, 1280×720, 1024×768, 768×1024, 430×932, 390×844, 360×800.

Initial Admin page measurements found Attendance document widths 431/425/425 at 430/390/360 viewports. After wrapping counts, final CR and Admin All Sections measurements on all ten pages at all eight sizes showed **no document horizontal overflow** (160 page/size checks). Login also showed no document horizontal overflow at all eight sizes. This establishes measured geometry, not that every visual/modal has been exhaustively checked.

At 1366×400, sidebar navigation was scrollable and Logout bottom was 376 (<400). At 360×800, a subject modal right edge was ~347 and bottom ~729, within the viewport. Drawer toggle/outside-overlay closing was exercised. Essential schedule columns are restored inside a scrolling table; timetable mobile rows retain section labels.

Representative screenshot: `qa/evidence/mobile-attendance.jpg`. All modal types at all breakpoints, keyboard focus behavior, and assistive technology are **Not Tested**.

## J. Automated tests added

Run:

```sh
node --experimental-vm-modules --test tests/qa.test.cjs
```

Result: **17 passed, zero failed**. Tests cover percentage/leave policies/empty totals, section-specific lecture numbering, approved Leave after copying statuses, remaining-class eligibility, historical roster preservation, group switching, schedule boundaries/exception recurrence/rescheduling, CR context/forged filter values, CRUD persistence, login normalization/mismatch/logout, manual/scheduled duplicates, attendance ownership, leave decisions, exception upsert/revert, inactive slots, subject uniqueness/group matching, section settings, blank fields/impossible dates, raw CSV bytes/escaping/BOM, module parsing, and local HTML asset existence.

Node prints its normal ExperimentalWarning for `vm.SourceTextModule`. These are deterministic local tests; they do not execute PostgreSQL or Supabase RLS.

## K. Files changed

- `README.md`: setup order, demo persistence, QA/test instructions.
- `css/responsive.css`: count wrapping, mobile identity/roll/schedule/section visibility, report header wrapping.
- `js/access-context.js`: fail-closed CR and group filters; topbar refresh; filter error handling.
- `js/app.js`: overlay lifecycle; uncaught startup fallback.
- `js/attendance-math.js`: approved-leave and historical-roster helpers.
- `js/attendance.js`: section binding/scoping, date/number validation, copied leave, historical roster, error handling.
- `js/dashboard.js`: unique student warnings and only-future batch exceptions.
- `js/export-utils.js`: raw CSV summary opt-in.
- `js/exports.js`: dependent export selections reset on context switches.
- `js/history.js`: configured color threshold and scoped hash detail lookup.
- `js/reports.js`: threshold colors, explicit export formats, All Students label.
- `js/schedule.js`: section numbering, completed status, date/occurrence validation and remaining helper.
- `js/settings.js`: section context/All Sections guard; immediate account identity refresh.
- `js/students.js`: selected-section import and mismatched-section rejection.
- `js/supabase.js`: safe profile lookup, section-aware settings, demo persistence/parity/guards and identity validation.
- `js/timetable.js`: mobile section label.
- `js/ui.js`: confirmation dismissal resolution and persistent sort direction.
- `tests/qa.test.cjs`: regression suite.
- `supabase/diagnostics/qa-integrity.sql`: read-only diagnostics.
- `supabase/migrations/20261002070000_qa_integrity_guards.sql`: prepared future-write guards.
- `qa/QA-AUDIT.md`, `qa/fixtures/students.csv`, `qa/fixtures/students.xlsx`, `qa/evidence/*`: report, generated import fixtures, evidence.

## L. Migrations changed/created

Created only `20261002070000_qa_integrity_guards.sql`. Existing migration history was not rewritten. The new migration adds student/leave, slot/exception, attendance/lecture/student, and scheduled lecture parent/date checks; checks active sections in CR RLS; permits global Admin profiles; and adds a NOT VALID CR-section requirement for future writes. It performs no user-record DELETE/UPDATE or reset.

Status: **Verified by Code/SQL Review; not applied; PostgreSQL execution Not Tested**. NOT VALID deliberately avoids silently rejecting/rewriting unknown existing bad CR rows during this audit. The migration is ordered and should be applied once in isolation before considering deployment. It does not implement transactions, reverse-parent transfer guards, or schedule-overlap policies.

## M. Manual Supabase actions required

No production action was performed or is required to view the local audit. Before a deployment decision:

1. Create an isolated project containing synthetic records only. Apply schema and migrations in order, including 050/060 and the new 070; do not re-run the bootstrap schema on an existing project.
2. Execute the SELECT-only diagnostics in that isolated project and record results.
3. Verify RLS policies/constraints/triggers are installed there. Run N, including direct requests using the normal authenticated client's JWT and public publishable key. Never put service-role keys in browser code.
4. Review all F risks. Validate the migration in isolation; it is not production-approved by this report.
5. If later reviewing production integrity, run diagnostics read-only under your normal administrator control and investigate findings individually. Do not automatically delete, remap, or repair rows.

## N. Exact manual regression checklist

### Isolated setup required

Every authenticated/database test in this section **Requires isolated Supabase test environment**. Do not run mutation or adversarial steps against the existing real-data project.

Create four synthetic Supabase Auth users through the dashboard: one Admin (`qa-admin@example.test`), CR A (`qa-cr-a@example.test`), CR B (`qa-cr-b@example.test`), and CR C (`qa-cr-c@example.test`). Use disposable test passwords; no service-role client is needed. Authorize matching profile user IDs; Admin role has null section, CRs have assigned section IDs.

Seed synthetic group G1 (QA Engineering / 2026 / Semester 1), sections A/B with codes/logins QA-26-A and QA-26-B; group G2 (QA Science / 2026 / Semester 1), section C code/login QA-26-C. Use the UUIDs generated by those rows and record them as G1/G2/A/B/C.

Seed two students in each section with unmistakable rolls QA-A-001/002, QA-B-001/002, QA-C-001/002. Seed shared G1 subject QA101 and shared G2 subject with the **same code** QA101. Set A settings to minimum 80 and exclude_leave, B to minimum 90 and count_leave_as_absent, C to 75/exclude_leave. Seed G1 subject lectures 1–5 for A, 1–9 for B, and separate G2 records for C; marks should include P/A/L so totals are calculable. Add one approved A leave covering the upcoming attendance date, one pending, one rejected. Add section-specific weekly slots for the current weekday, two future slots, one already-ended slot, and an inactive slot. Include additional occurrences tomorrow/next week for reschedule testing. Record all IDs before mutation.

### Local/demo rerun (no Supabase mutation)

1. Serve the repo; open `dashboard.html?demo=1`. Confirm all/all-section baseline labels, filter A then B, and navigate all pages. Refresh and use Back/Forward; context remains until Logout.
2. Demo CR login with ` ee-25-a ` and any placeholder password. Confirm every page stays A; Subjects has no add/edit/delete buttons. CR login using the demo Admin email reports role mismatch.
3. On Attendance, use a B slot URL while CR A is signed in: unavailable. A manual `section=B` parameter must still display A's roster.
4. Import `qa/fixtures/students.csv` then `.xlsx` while A is selected; both QA students appear and survive refresh. In All Sections, import must reject until a section is selected. Import a file naming B while A is selected: reject the mismatch.
5. Create/approve today's QA leave for a student, open new attendance, click Copy Previous: that student remains L. Manually choosing a different P/A/L remains possible.
6. Add a timetable slot with end before start: reject; correct it, edit room, mark inactive, then verify no recurring schedule instance is shown.
7. Cancel a future slot occurrence: cancelled page offers no scheduled save. Change to Break: no-class page offers no scheduled save. Reschedule it: original occurrence blocked, new date/time available, next week's weekly slot unchanged.
8. Save a scheduled lecture, refresh dashboard: Attendance Taken. Reopen its URL: existing-record screen. Confirm next number advances only after attendance, not cancellation/break.
9. Import a new student after a historical lecture exists. Edit that lecture: only its original recorded students appear; saving must not invent a new student's historical Present mark.
10. Set minimum 90 for one section, open History: 83.3% is red. Change back to 75: it meets the threshold. Confirm the other section's settings did not change.
11. Test roster and subject sort headers twice; ordering reverses. Close a delete confirmation with X/outside click; no deletion. Delete only generated QA demo records when testing destructive flows.
12. Check all eight sizes. Scroll tables internally to reach status/actions; the document should not scroll horizontally. Mobile drawer opens/closes through overlay; on a short-height desktop, links scroll while Logout remains reachable.

### Authentication and RLS (isolated project only)

1. Point a **local test copy** of config at the isolated project using its public publishable key. Admin and each CR sign in with correct credentials; wrong password, empty fields, unknown IDs, repeated failures, role mismatch, and logout/re-login must behave correctly. Record Supabase Auth errors/rate-limit behavior; demo passwords cannot test this.
2. Keep a CR B token from before deactivation, then disable B. CR B login via Section ID **and direct email** must fail or block after authentication. Direct data queries with the older token must now return no scoped data. Re-enable B in isolation afterward.
3. As CR A, use direct authenticated Supabase SELECTs with `.eq('section_id', B)` for students, lectures, timetable, settings, leaves and exceptions. Expected: no B rows. Attendance queries for B lecture IDs must reveal no B marks; G2 subjects must not be readable. Record actual returned rows/error codes.
4. Still as CR A, attempt insert/update/delete with B's IDs for each scoped table. Expected: denied/no changes. Confirm counts as Admin after each attempt; an update returning zero rows without error is not permission success.
5. Set a leave's section to A but student_id to B's student; set exception section to A but schedule_slot_id to B's slot. Expected: guard rejection, no saved rows. The supplied own section must not bypass parent ownership.
6. Attempt CR subject insert/update/delete, profile role=admin, profile section_id=B, and user_id reassignment. Expected: rejection/no changes. Verify profile role/assignment as Admin afterward.
7. Alter URL/localStorage/sessionStorage and frontend context to B. Repeat direct queries with the same CR A token: database isolation must still hold. Demo-only storage is not evidence for this test.
8. As Admin, read/manage A/B/C and both groups. Same subject code across groups succeeds; duplicate within G1 fails. Cross-group timetable/lecture subject assignment fails.
9. As Admin, attempt attendance with A lecture and B student: reject. Try scheduled lecture mismatching slot section/subject, cancelled/break/original rescheduled date, arbitrary weekday: reject. Same-day valid incoming reschedule must succeed. Run diagnostics afterward.
10. Remove/expire the test session and open a protected URL/refresh. Expected: login or explicit usable error, no data display. Do not assume cached getSession alone proves server validity.

### Business, fault and export checks (isolated project only where DB is involved)

1. Record A Lecture 5, cancel next occurrence, mark following one No Class, save the next real occurrence: Lecture 6. B's Lecture 9 must not change A's next number. A reschedule advances only when saved.
2. Two simultaneous clients save the same slot/date. Exactly one lecture and one mark per student may remain. Repeat with manual identical subject/section/date/number. Test different dates to assess number allocation (R-13).
3. Inject attendance INSERT failure after lecture creation and UPSERT failure after metadata update using test-only permissions/fault tooling. Inspect both tables; document R-01 partial-write behavior and compensation failure. Never do this in production.
4. Test overlapping weekly slots, overlapping leaves and two incoming reschedules to the same slot/date. Record current acceptance; resolve expected policy before treating acceptance as a pass.
5. Approve leave across start/end boundaries, pending/rejected leave and dates outside the range. For 3 P / 1 A / 2 L, expect 75% exclude_leave and 50% count_leave_as_absent; all-L denominator zero yields 0%. Compare Dashboard, Attendance, History, Reports and exports.
6. With A=80/exclude and B=90/count, compare specific-section reports then All Sections. Record the unresolved combined-policy discrepancy (R-02); do not sign off aggregate thresholds by assuming 75.
7. Test Student/Subject/Below-threshold reports with All Students, specific student, all/specific subjects, section, date range, no-result filters, reversed dates, and group switching. Verify screen P/A/L against underlying marks and each file.
8. Export CSV/XLSX/PDF from Student and Subject reports, Below-threshold reports, History lecture view, Student roster and every Export Data scope (lecture/student/subject/date/section/semester/short). Open the actual downloaded files. Confirm row counts, no duplicate marks, dates, section labels, header names, filenames, and PDF page breaks. PDF/XLSX layout is not yet verified by this audit.
9. Open raw CSV as UTF-8; expect BOM, properly doubled quotes and quoted embedded newlines, with no default summary footer. Include synthetic comma/quote/newline/non-ASCII names and a formula-like value to decide R-10 safe-spreadsheet policy.
10. Test missing optional timetable/leaves/exceptions tables and Supabase 4xx/5xx failures **only in a disposable isolated project**. Page loads should use documented fallbacks; actions should show useful errors, restore disabled controls, and leave no uncaught promise.
11. Test settings duplicates/absence, changing threshold and leave policy, display name and password change. Complete real password changes personally in the isolated account; confirm logout/new-password login afterward.
12. Delete synthetic QA students/subjects/slots/lectures only; verify and document cascades. Test parent reassignment with history (R-03), existing attendance followed by cancellation/reschedule/revert (R-14), and final diagnostics. Clean test records using recorded IDs; never broadly delete real records.
13. Seed more rows than the isolated server's configured response row limit, compare DB totals with every page/export, and investigate R-17 truncation. Test forged creator/approver IDs in direct writes to document R-18; only synthetic actors/data may be used.

### Test-data cleanup

Node tests use fresh in-memory stores and leave no DB records. Browser QA-created students, subject, timetable slot, and generated lectures were deleted through demo UI; the edited sample status, section-B threshold, and display name were restored. One approved local demo leave request with reason `QA audit demo approved leave` remains because the product has no leave-delete UI; it is confined to demo localStorage, not Supabase. Import fixtures remain intentionally as reproducible test files. No production cleanup is needed.
