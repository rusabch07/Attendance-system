-- Phase 2: link a lecture to the timetable slot that launched it.
-- Existing lectures remain valid because the new foreign key is nullable.
alter table public.lectures
  add column schedule_slot_id uuid references public.timetable(id) on delete set null;

-- Only timetable-linked lectures are unique per slot and date. Manual lectures
-- keep schedule_slot_id null and are deliberately excluded from this rule.
create unique index lectures_schedule_slot_date_unique
  on public.lectures(schedule_slot_id, lecture_date)
  where schedule_slot_id is not null;
