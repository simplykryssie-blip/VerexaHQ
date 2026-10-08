-- recon-347 recovered run_automation_test's current 5-arg signature
-- (p_automation_id, p_client_id, p_engagement_id, p_webhook_event_type,
-- p_webhook_payload) via CREATE OR REPLACE, which does not touch the
-- original 3-arg overload main's own baseline still carries
-- (p_automation_id, p_client_id, p_engagement_id) -- Postgres function
-- overloading is signature-based, so both now exist side by side. This is
-- exactly the overload-duplication/stale-grant class of bug PR #337's own
-- webhook_workflow_test_mode migration existed to avoid; drop the old
-- overload explicitly rather than leaving two callable versions of the
-- same RPC with potentially different grants.
drop function if exists public.run_automation_test(uuid, uuid, uuid);

revoke all on function public.run_automation_test(uuid, uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.run_automation_test(uuid, uuid, uuid, text, jsonb) to authenticated, service_role;
