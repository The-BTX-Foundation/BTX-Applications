-- The original program_plan_milestones migration (20260908150356) deliberately
-- omitted a DELETE policy and the authenticated DELETE grant, since at the time
-- the only writer was the sync-program-plan-milestones Edge Function running as
-- service_role, which bypasses RLS and table grants entirely.
--
-- That's no longer the whole picture: the Import feature's replace-set write
-- mode for this table (Phase 4) deletes stale milestones directly from the
-- admin's own authenticated browser session, not from service_role. Without
-- an admin-scoped DELETE policy and the matching authenticated grant, that
-- delete is rejected by RLS before it ever reaches the table -- confirmed
-- live against pg_policies during Phase 4 Explore (INSERT/SELECT/UPDATE only,
-- no DELETE row). This migration adds exactly what's missing for that path,
-- nothing else.

CREATE POLICY "Admin can delete program plan milestones" ON "public"."program_plan_milestones" FOR DELETE USING (((("auth"."jwt"() -> 'user_metadata'::"text") ->> 'role'::"text") = 'admin'::"text"));

GRANT DELETE ON TABLE "public"."program_plan_milestones" TO "authenticated";
