# Class Attendance System

A static HTML, CSS, and JavaScript attendance application backed by Supabase and suitable for GitHub Pages.

## Supabase setup

1. Create or open the Supabase project used by the application.
2. For a new database, run `supabase/schema.sql` once in **Supabase Dashboard → SQL Editor**.
3. Run each file in `supabase/migrations` in filename order:

   `supabase/migrations/20261002000000_create_timetable.sql`

   `supabase/migrations/20261002010000_link_timetable_attendance.sql`

   `supabase/migrations/20261002020000_add_leave_attendance.sql`

   `supabase/migrations/20261002030000_create_student_leaves.sql`

   `supabase/migrations/20261002040000_add_multi_section_structure.sql`

4. Confirm that `public.timetable` appears in **Table Editor** and that Row Level Security is enabled.
5. Keep the existing public Supabase URL and publishable/anon key in `js/config.js`. Never add a service-role key to browser code.

The Phase 1 migration creates the timetable table, indexes, and policies. The Phase 2 migration adds a nullable `schedule_slot_id` foreign key to lectures and a partial unique index for scheduled attendance. Existing historical lectures remain valid with a null slot ID. Neither migration updates or deletes attendance records. Review the SQL before running it; the application does not execute migrations automatically.

The Phase 3 migration adds `leave` as an attendance status and defaults the leave calculation policy to excluding leave from the percentage denominator. It does not modify existing attendance records.

The Phase 4 migration adds the student leave request table and role-protected access policies. Approved requests preselect students as on leave for new attendance on covered dates; existing attendance is not changed.

The Phase 5 migration creates `public.sections`, adds and backfills `section_id` on existing records to the default Section A, and replaces broad RLS policies with section-scoped policies. Existing clients remain compatible because new section IDs default to Section A. No accounts or login behavior are created or changed by this migration.

## Timetable workflow

- Open **Timetable** from the sidebar to add, edit, or delete weekly slots.
- Subjects are selected from `public.subjects`; only the subject ID is stored in a slot.
- The dashboard uses the browser's local weekday and time to show active slots for today.
- **Take Attendance** from a current or missed slot opens the existing attendance page with the subject, section, local date, timetable slot, and next subject lecture number prefilled.
- Once scheduled attendance is saved, the dashboard shows **Attendance Taken** with a **View** action for that slot.
- Scheduled entries are protected against a second lecture for the same date and slot. Manual extra lectures remain available from the sidebar and are not subject to the timetable duplicate rule.

## Local demo

Serve the project with any static web server and open `dashboard.html?demo=1`. Demo mode includes active and inactive timetable rows and does not write to Supabase.

## Deployment

Deploy the repository as a static GitHub Pages site after applying the Supabase migration. No build step is required.

