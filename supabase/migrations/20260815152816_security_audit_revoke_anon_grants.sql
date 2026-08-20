-- Full security audit (task: "do a full security check") surfaced 185
-- SECURITY DEFINER functions flagged by Supabase's advisor as executable
-- by anon/authenticated with no explicit revoke. Spot-checking confirmed
-- every one of these correctly no-ops for an unauthenticated caller
-- today (they're all built on the has_permission()/is_workspace_admin()/
-- auth.uid()-scoping pattern used consistently across this schema, which
-- returns false/no-rows for a null auth.uid()) -- so this is hardening
-- against future regressions, not a fix for a currently-exploited hole,
-- with one exception below.
--
-- hash_firm_secret IS a real, currently-live issue: it takes arbitrary
-- caller-supplied plaintext and returns its HMAC-SHA256 digest (keyed by
-- the firm_tax_profile_key vault secret), used to compute ptin_hash/
-- ssn_hash/ein_hash for duplicate-registration checks. With no grant
-- restriction, anyone unauthenticated could call it directly as a hash
-- oracle -- computing the exact hash for any candidate SSN/EIN/PTIN
-- without ever needing the vault key -- which, combined with the
-- "already registered to another account" existence-revealing error in
-- set_my_ptin, could be used to test guesses against real records this
-- function was specifically designed to keep hashed. Revoking direct
-- access closes this off; the internal callers (set_my_ptin, the SSN/EIN
-- dedup checks in firm_tax_profile) keep working since a SECURITY
-- DEFINER function calling another one runs as the function owner, which
-- always has implicit EXECUTE on its own functions independent of any
-- grant to interactive roles.
--
-- Also revoking the 13 trigger-return functions below: PostgREST doesn't
-- expose functions returning `trigger` as callable /rpc/ endpoints, and
-- Postgres trigger firing never requires the triggering role to hold
-- EXECUTE on the trigger function -- so this has zero effect on any live
-- behavior, it just removes dead-but-technically-reachable grants.
revoke all on function public.hash_firm_secret(text) from public, anon, authenticated;

revoke all on function public.apply_client_default_assignment() from public, anon, authenticated;
revoke all on function public.apply_workflow_stage_default_assignment() from public, anon, authenticated;
revoke all on function public.enforce_ero_efile_gate() from public, anon, authenticated;
revoke all on function public.fire_appointment_status_automations() from public, anon, authenticated;
revoke all on function public.fire_client_tag_automations() from public, anon, authenticated;
revoke all on function public.fire_engagement_created_automations() from public, anon, authenticated;
revoke all on function public.fire_organizer_submitted_automations() from public, anon, authenticated;
revoke all on function public.fire_portal_created_automations() from public, anon, authenticated;
revoke all on function public.log_engagement_completed_on_invoice_paid() from public, anon, authenticated;
revoke all on function public.protect_entry_lead_stage() from public, anon, authenticated;
revoke all on function public.sync_filing_status_from_organizer() from public, anon, authenticated;
revoke all on function public.trg_resolve_organizer_response_service() from public, anon, authenticated;
revoke all on function public.validate_client_lifecycle_status() from public, anon, authenticated;

-- ensure_next_tax_year is only ever called from a cron route using the
-- service_role key (bypasses grants entirely), so it needs no grant to
-- any interactive role at all.
revoke all on function public.ensure_next_tax_year() from public, anon, authenticated;

-- The remaining functions are real, intentional staff-facing RPCs (called
-- from the app while logged in) -- they just need the anon/public grant
-- closed, keeping the authenticated grant they already relied on.
revoke all on function public.accept_firm_connection_billing(uuid) from public, anon;
grant execute on function public.accept_firm_connection_billing(uuid) to authenticated;

revoke all on function public.add_process_stage(uuid, text) from public, anon;
grant execute on function public.add_process_stage(uuid, text) to authenticated;

revoke all on function public.add_process_stage_to_pipeline(uuid, text) from public, anon;
grant execute on function public.add_process_stage_to_pipeline(uuid, text) to authenticated;

revoke all on function public.copy_shared_engagement(uuid) from public, anon;
grant execute on function public.copy_shared_engagement(uuid) to authenticated;

revoke all on function public.create_engagement(uuid, uuid, uuid, uuid, engagement_priority, uuid, uuid, text, timestamp with time zone) from public, anon;
grant execute on function public.create_engagement(uuid, uuid, uuid, uuid, engagement_priority, uuid, uuid, text, timestamp with time zone) to authenticated;

revoke all on function public.create_engagement_share(uuid) from public, anon;
grant execute on function public.create_engagement_share(uuid) to authenticated;

revoke all on function public.create_firm_connection_invite(uuid, text) from public, anon;
grant execute on function public.create_firm_connection_invite(uuid, text) to authenticated;

revoke all on function public.create_workflow_pipeline(uuid, text) from public, anon;
grant execute on function public.create_workflow_pipeline(uuid, text) to authenticated;

revoke all on function public.delete_process_stage(uuid, uuid, text) from public, anon;
grant execute on function public.delete_process_stage(uuid, uuid, text) to authenticated;

revoke all on function public.disconnect_firm_connection(uuid) from public, anon;
grant execute on function public.disconnect_firm_connection(uuid) to authenticated;

revoke all on function public.release_firm_connection_billing(uuid) from public, anon;
grant execute on function public.release_firm_connection_billing(uuid) to authenticated;

revoke all on function public.rename_process_stage(uuid, text) from public, anon;
grant execute on function public.rename_process_stage(uuid, text) to authenticated;

revoke all on function public.resubmit_engagement_share(uuid) from public, anon;
grant execute on function public.resubmit_engagement_share(uuid) to authenticated;

revoke all on function public.reveal_my_ptin() from public, anon;
grant execute on function public.reveal_my_ptin() to authenticated;

revoke all on function public.set_my_ptin(text, boolean) from public, anon;
grant execute on function public.set_my_ptin(text, boolean) to authenticated;

revoke all on function public.turn_on_service(uuid, uuid, text) from public, anon;
grant execute on function public.turn_on_service(uuid, uuid, text) to authenticated;

-- Three SECURITY INVOKER string-formatting helpers (escape_html,
-- format_mailing_address, format_organizer_answer) were flagged for a
-- mutable search_path. They're SECURITY INVOKER with no dynamic SQL or
-- table access, so the classic schema-shadowing privilege-escalation
-- risk that this matters most for doesn't really apply -- but pinning
-- search_path is a one-line fix and this codebase does it everywhere
-- else, so closing the gap for consistency.
alter function public.escape_html(text) set search_path to 'public';
alter function public.format_mailing_address(text) set search_path to 'public';
alter function public.format_organizer_answer(text, jsonb) set search_path to 'public';
