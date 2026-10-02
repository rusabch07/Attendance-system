# Class Attendance System

A static HTML, CSS, and JavaScript attendance application backed by Supabase and suitable for GitHub Pages.

## Supabase setup

1. Create or open the Supabase project used by the application.
2. For a new database, run `supabase/schema.sql` once in **Supabase Dashboard → SQL Editor**.
3. Run each file in `supabase/migrations` in filename order. For Phase 1, run:

   `supabase/migrations/20261002000000_create_timetable.sql`

4. Confirm that `public.timetable` appears in **Table Editor** and that Row Level Security is enabled.
5. Keep the existing public Supabase URL and publishable/anon key in `js/config.js`. Never add a service-role key to browser code.

The timetable migration only creates the new timetable table, indexes, and policies. It does not update or delete students, subjects, lectures, or attendance records. Review the SQL before running it; the application does not execute migrations automatically.

## Timetable workflow

- Open **Timetable** from the sidebar to add, edit, or delete weekly slots.
- Subjects are selected from `public.subjects`; only the subject ID is stored in a slot.
- The dashboard uses the browser's local weekday and time to show active slots for today.
- **Take Attendance** from a current or missed slot opens the existing attendance page with the subject and section preselected. Manual attendance remains available from the sidebar exactly as before.

## Local demo

Serve the project with any static web server and open `dashboard.html?demo=1`. Demo mode includes active and inactive timetable rows and does not write to Supabase.

## Deployment

Deploy the repository as a static GitHub Pages site after applying the Supabase migration. No build step is required.

