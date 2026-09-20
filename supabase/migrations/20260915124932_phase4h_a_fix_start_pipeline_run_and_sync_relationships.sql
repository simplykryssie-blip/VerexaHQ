-- ============================================================================
-- MIGRATION RECONCILIATION PHASE 1.9 -- RECOVERED FROM PRODUCTION (PR #268)
--
-- Did not previously exist in Git main. Applied directly to production
-- during the MKB Tax Prep + Client Review + F1/F2/NW-1 security work
-- (PR #268, branch claude/verexa-schema-mismatch-i8c19u, never merged).
-- This filename's version already exactly matches the real recorded
-- production version in supabase_migrations.schema_migrations -- no rename
-- needed. Content verified byte-for-byte (modulo a single trailing
-- newline) against schema_migrations.statements. Confidence: A -- exact
-- original recovered.
-- ============================================================================
-- Phase 4H-A: fixes F1 and F2 from the Phase 4H adversarial security audit.
--
-- F1 -- start_pipeline_run(p_entity_type, p_entity_id, p_process_id) had no
-- authentication/authorization check at all and was EXECUTE-granted to
-- PUBLIC/anon/authenticated. Live-proven exploit: an anonymous caller could
-- create a real pipeline_runs/pipeline_stages row for ANY workspace's
-- client/engagement/firm_connection by supplying its id, using a process_id
-- from ANY workspace (never validated against the entity's own workspace).
--
-- Caller audit (every current caller found via a full-schema search):
--   - accept_quote: portal-facing, already checks is_portal_user() and
--     already resolves the process_id from a service scoped to the quote's
--     own workspace before calling this.
--   - create_engagement: staff-facing, already checks
--     has_permission(p_workspace_id, 'engagements.manage') and already
--     validates p_process_id/p_service_id belong to p_workspace_id (or are
--     workspace_id-null/global) before calling this.
--   - advance_pipeline_stage: staff-facing, already checks has_permission()
--     on the entity's workspace, but does NOT validate that p_process_id
--     belongs to that same workspace before calling this -- the one real
--     caller-side gap found.
--   - execute_automation_step (move_pipeline_stage / move_lead_to_service_pipeline
--     actions): process_id comes from the automation's own step config
--     (authored by staff for their own workspace) or from a service looked
--     up for the run's own client -- both expected to already be
--     same-workspace, but not defensively re-checked.
--
-- Every legitimate caller is itself a SECURITY DEFINER function that already
-- performs its own real authorization check (has_permission/is_portal_user)
-- before reaching this function -- there is no legitimate end-user-facing
-- call path to start_pipeline_run directly. Adding a permission check
-- *inside* this function would be wrong: execute_automation_step runs with
-- no acting auth.uid() (it's driven by the automation engine/cron, not a
-- signed-in user), so a has_permission()/is_portal_user() check here would
-- break that legitimate caller. The correct, narrow fix is:
--   1. Make this function internal-only (revoke PUBLIC/anon/authenticated;
--      keep postgres/service_role, matching the existing
--      _advance_pipeline_stage_unchecked convention) -- this alone closes
--      the live-proven anonymous exploit.
--   2. Add workspace-ownership validation for p_process_id (defense in
--      depth, and the fix for advance_pipeline_stage's real gap) -- reject
--      if the process belongs to a *different*, non-null workspace than the
--      resolved entity.
--   3. Add an is_workspace_operational() check, since none of the callers
--      currently check suspension before calling this and it performs a
--      real mutation -- this closes that gap once, for every caller, rather
--      than touching four separate functions.
create or replace function public.start_pipeline_run(p_entity_type text, p_entity_id uuid, p_process_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_run_id uuid;
  v_workspace_id uuid;
  v_process_workspace_id uuid;
begin
  if p_entity_type = 'client' then
    select workspace_id into v_workspace_id from public.clients where id = p_entity_id;
  elsif p_entity_type = 'engagement' then
    select workspace_id into v_workspace_id from public.engagements where id = p_entity_id;
  elsif p_entity_type = 'firm_connection' then
    select parent_workspace_id into v_workspace_id from public.firm_connections where id = p_entity_id;
  else
    raise exception 'unsupported entity_type: %', p_entity_type;
  end if;

  if v_workspace_id is null then
    raise exception '% not found', p_entity_type;
  end if;

  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  if not exists (select 1 from public.processes where id = p_process_id) then
    raise exception 'process % not found', p_process_id;
  end if;

  select workspace_id into v_process_workspace_id from public.processes where id = p_process_id;
  if v_process_workspace_id is not null and v_process_workspace_id is distinct from v_workspace_id then
    raise exception 'process % does not belong to this workspace', p_process_id;
  end if;

  insert into public.pipeline_runs (workspace_id, entity_type, entity_id, process_id, status, started_at)
  values (v_workspace_id, p_entity_type, p_entity_id, p_process_id, 'Active', now())
  returning id into v_run_id;

  insert into public.pipeline_stages (workspace_id, pipeline_run_id, entity_type, process_stage_id, stage_name, display_order)
  select v_workspace_id, v_run_id, p_entity_type, id, name, display_order
  from public.process_stages
  where process_id = p_process_id
  order by display_order asc;

  update public.pipeline_runs
  set current_stage_id = (select id from public.pipeline_stages where pipeline_run_id = v_run_id order by display_order asc limit 1)
  where id = v_run_id;

  update public.pipeline_stages
  set status = 'In Progress', started_at = now()
  where id = (select current_stage_id from public.pipeline_runs where id = v_run_id);

  return v_run_id;
end;
$function$;

revoke execute on function public.start_pipeline_run(text, uuid, uuid) from public;
revoke execute on function public.start_pipeline_run(text, uuid, uuid) from anon;
revoke execute on function public.start_pipeline_run(text, uuid, uuid) from authenticated;

-- F2 -- sync_client_relationships_for_response(p_response_id) had no
-- authentication/authorization check and was EXECUTE-granted to
-- PUBLIC/anon/authenticated. It correctly derives client_id/workspace_id
-- from the organizer_responses row itself (a caller cannot inject a foreign
-- client/workspace), but an anonymous caller could still force it to
-- INSERT/UPDATE client_relationships (including encrypted-SSN fields) for
-- ANY tenant purely by supplying a guessed/known organizer_response id.
--
-- Caller audit: this function has exactly two callers in the entire schema,
-- both DB trigger functions --
-- sync_client_relationships_from_organizer_submission (fires on
-- organizer_responses status transitioning to 'submitted') and
-- sync_client_relationships_from_answer_change (fires on
-- organizer_response_answers insert/update once already submitted/reviewed).
-- There is no application code, API route, or other RPC that calls it, and
-- no legitimate reason for any end-user role (staff, portal, or anonymous)
-- to invoke it directly -- it is a pure internal helper factored out of
-- those two triggers. Following the same convention as
-- _advance_pipeline_stage_unchecked: make it internal-only rather than
-- adding an authorization check that no real caller needs or could satisfy
-- (the triggers themselves run with no acting auth.uid()).
revoke execute on function public.sync_client_relationships_for_response(uuid) from public;
revoke execute on function public.sync_client_relationships_for_response(uuid) from anon;
revoke execute on function public.sync_client_relationships_for_response(uuid) from authenticated;
