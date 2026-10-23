-- Grants for the push tables (20261022200000_ops_push.sql).
--
-- This project's default privileges no longer give new tables any read or write rights: a table created by postgres in
-- public gets only TRUNCATE, REFERENCES, TRIGGER and MAINTAIN for anon, authenticated and service_role, and a new sequence
-- gets nothing (checked in pg_default_acl, 2026-10-22). Older tables were created under the old defaults, so they have
-- full grants without naming them. The push tables were created without grants, so the server (service_role) could not
-- read or write them and every push would have failed with "permission denied". Same pattern as email_log.
--
-- Idempotent: safe to run twice.

grant select, insert, update, delete on public.ops_push_devices to service_role;
grant select, insert, update, delete on public.ops_push_log to service_role;
grant usage, select on sequence public.ops_push_log_id_seq to service_role;

-- Board members read their own phone rows (row level security: ops_push_devices_select_own). Nothing else for clients.
grant select on public.ops_push_devices to authenticated;
revoke references, trigger, truncate on public.ops_push_devices from anon, authenticated;
revoke references, trigger, truncate on public.ops_push_log from anon, authenticated;
