-- Automations reconciliation: approve_automation_step/reject_automation_step
-- have never had an explicit grant/revoke statement since they were first
-- created (baseline schema) -- meaning they still carry Postgres/Supabase's
-- default EXECUTE-to-PUBLIC grant, which cascades to both `anon` and
-- `authenticated`. Both functions already have a correct internal
-- authorization check (is_workspace_admin(...) or a matching
-- approver_role_id, safe against an unauthenticated caller since
-- auth.uid() is null for anon and is_workspace_admin() returns false for a
-- null user_id), so this is not an exploitable gap the way the phone-number
-- functions were -- but it's still an unintentional grant that doesn't
-- match this project's least-privilege convention, and every real caller
-- (a signed-in staff member approving/rejecting their own workflow's
-- pending step, from app/(app)/workflows client code) is authenticated.
--
-- Same pattern as decide_automation_step (20260927050000_decision_step.sql),
-- the other review/decision RPC in this same domain: revoke the
-- unintentional PUBLIC grant, keep EXECUTE for authenticated only.

revoke all on function public.approve_automation_step(uuid) from public;
grant execute on function public.approve_automation_step(uuid) to authenticated;

revoke all on function public.reject_automation_step(uuid, text) from public;
grant execute on function public.reject_automation_step(uuid, text) to authenticated;
