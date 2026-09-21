-- Phase 1.11 follow-up: least_privilege_public_grant_corrective_fix and its
-- part2/part3 sweep (recovered elsewhere in this same migration set) closed
-- PUBLIC's default EXECUTE grant on ~450 functions back on 2026-09-19, but a
-- live audit against production today found 43 functions that still carry
-- it -- almost all because they were created, or given a new overload via
-- CREATE OR REPLACE with a changed argument list (which resets a function's
-- ACL to schema default = EXECUTE granted to PUBLIC), after that sweep ran.
-- search_clients is the clearest example: its 14-arg overload
-- (20261031000000_search_clients_type_email_phone_filters.sql) post-dates
-- the sweep by six weeks.
--
-- Of the 43, ~25 are legitimate token-authenticated public entrypoints
-- (sign_public_engagement_letter, submit_public_organizer_response, etc.)
-- where PUBLIC vs. an explicit anon grant makes no functional difference --
-- left alone here, not in scope. Two classes need closing:
--
-- 1. Real staff/authenticated-only RPCs that regressed back to anon-callable.
--    Internal SECURITY DEFINER auth checks (has_permission/is_workspace_*)
--    already reject an anon caller, so this is hardening-only, matching
--    every other migration in this set -- not a logic change.
revoke execute on function public.search_clients(uuid, text, text[], text, uuid, uuid, text, boolean, boolean, text, boolean, boolean, integer, integer) from public, anon;
revoke execute on function public.archive_client(uuid) from public, anon;
revoke execute on function public.restore_client(uuid) from public, anon;
revoke execute on function public.create_client_from_ghl_import(uuid, text, text, text, text, date, text, text, text, text, text, boolean) from public, anon;
revoke execute on function public.check_login_lockout(text) from public, anon, authenticated;

-- debug_whoami has zero callers anywhere in the application (confirmed via
-- repo-wide search) -- a diagnostic leftover, not a feature. Locked to
-- service_role rather than left broadly callable for no reason; left in
-- place rather than dropped since removing dead functions is out of this
-- phase's scope (logged as a cleanup candidate in the phase report).
revoke execute on function public.debug_whoami() from public, anon, authenticated;

-- 2. Trigger-only functions, matching the established convention elsewhere
--    in this codebase (lead_stages_trigger_fn_lockdown et al.) that trigger
--    bodies should never be directly callable via PostgREST RPC.
revoke execute on function public.audit_pipeline_event() from public, anon, authenticated;
revoke execute on function public.auto_start_lead_pipeline_on_create() from public, anon, authenticated;
revoke execute on function public.protect_workspace_users_owner_flag() from public, anon, authenticated;
revoke execute on function public.enforce_automation_status_enabled() from public, anon, authenticated;
revoke execute on function public.skip_duplicate_active_automation_run() from public, anon, authenticated;

-- Deliberately NOT touched here: apply_qb_intake_qualification. It has zero
-- callers or defining migration anywhere in this repo -- it belongs to the
-- not-yet-recovered MKB QuickBooks-intake lineage (a separate, explicitly
-- out-of-scope roadmap item), and revoking its grants without the context
-- of what calls it risks breaking an MKB automation this phase can't see.
