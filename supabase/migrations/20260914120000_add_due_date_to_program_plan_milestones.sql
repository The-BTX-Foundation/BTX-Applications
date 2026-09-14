-- program_plan_milestones was created (20260908150356) without a due_date
-- column since the Apps Script's WBS-tab sync didn't read one at the time.
-- The WBS sheet's own "Due Date" column has existed the whole time -- it
-- was simply never included in what gets sent to
-- sync-program-plan-milestones. This migration adds the column; a
-- follow-up Apps Script change (see that Edge Function's own updated
-- comment) is what actually starts populating it.
--
-- Nullable, matching tasks_alerts.due_date's own precedent exactly: a WBS
-- milestone commonly has no due date assigned yet (backlog/not-yet-
-- scheduled work), and due_date plays no part in this table's existing
-- (plan_year, milestone_name) UNIQUE key, so there's no upsert-conflict
-- reason to force it NOT NULL the way event_tracker_events.event_date is.

ALTER TABLE "public"."program_plan_milestones"
    ADD COLUMN "due_date" "date";
