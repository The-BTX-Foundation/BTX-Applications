-- Adds created_at to tasks_alerts, matching marketing_tasks/budgeting_tasks/
-- fundraising_tasks, which all already have it. tasks_alerts never had any
-- creation-timestamp column, so Alert Center's New Items section (anything
-- created in the last 48h) had no way to include this table at all until now.
--
-- Existing rows have no real creation time to recover, so backfilling them to
-- now() would be actively wrong for New Items: every pre-existing row would
-- suddenly look "just created" the moment this migration runs, flooding New
-- Items with weeks-old tasks/approvals on day one. Backfilling to 30 days in
-- the past instead puts every existing row safely outside the 48h window from
-- the moment this lands -- no app-side code has to know about or filter out
-- a "backfill batch". Only rows created after this migration (via the
-- DEFAULT set below) get a real, accurate created_at.
alter table public.tasks_alerts add column created_at timestamptz;
update public.tasks_alerts set created_at = now() - interval '30 days' where created_at is null;
alter table public.tasks_alerts alter column created_at set default now();
alter table public.tasks_alerts alter column created_at set not null;
