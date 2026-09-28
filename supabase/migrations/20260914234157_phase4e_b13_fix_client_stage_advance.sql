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
-- Fixes a real bug found in testing: approve_client_review and
-- decline_client_review_filing called the public advance_pipeline_stage()
-- RPC to move the pipeline forward, but that function has its own
-- internal has_permission(..., 'engagements.manage') check -- correct for
-- its normal staff-driven callers, but wrong here: the client calling
-- approve/decline has already been authorized the correct way for a
-- client action (is_portal_user()), and staff permission was never the
-- right gate for a client's own decision. Extracts the stage-walk
-- mechanics (identical to advance_pipeline_stage's own loop) into a
-- private helper with no permission check of its own -- authorization is
-- the calling RPC's responsibility, and every caller of this helper
-- already performs its own correct check before calling it.
create or replace function public._advance_pipeline_stage_unchecked(p_entity_type text, p_entity_id uuid, p_process_id uuid, p_process_stage_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_run_id uuid;
  v_stage_id uuid;
  v_target_stage_id uuid;
  v_target_order int;
  v_current_order int;
  v_loop_guard int;
begin
  select id, current_stage_id into v_run_id, v_stage_id
  from public.pipeline_runs
  where entity_type = p_entity_type and entity_id = p_entity_id and status = 'Active' and process_id = p_process_id;

  if v_run_id is null then
    raise exception 'no active pipeline run for this %', p_entity_type;
  end if;

  select id into v_target_stage_id from public.pipeline_stages
  where pipeline_run_id = v_run_id and process_stage_id = p_process_stage_id;

  if v_target_stage_id is null then
    raise exception 'Target stage is not part of this pipeline';
  end if;

  select display_order into v_target_order from public.pipeline_stages where id = v_target_stage_id;
  select display_order into v_current_order from public.pipeline_stages where id = v_stage_id;

  if v_target_order < v_current_order then
    raise exception 'Moving backward through pipeline stages is not supported';
  end if;

  v_loop_guard := 0;
  while v_stage_id is distinct from v_target_stage_id and v_loop_guard < 100 loop
    update public.pipeline_stages set status = 'Completed', completed_at = now() where id = v_stage_id;
    select current_stage_id into v_stage_id from public.pipeline_runs where id = v_run_id;
    v_loop_guard := v_loop_guard + 1;
  end loop;
end;
$function$;

revoke all on function public._advance_pipeline_stage_unchecked(text, uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.approve_client_review(p_engagement_id uuid, p_comment text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_client_id uuid;
  v_process_id uuid;
  v_stage_name text;
  v_target_stage_id uuid;
begin
  select workspace_id, client_id, process_id, stage_name
  into v_workspace_id, v_client_id, v_process_id, v_stage_name
  from public._get_engagement_active_stage_name(p_engagement_id);

  if v_workspace_id is null then
    raise exception 'engagement not found or has no active pipeline run';
  end if;
  if not public.is_portal_user(v_client_id) then
    raise exception 'not authorized to respond to this engagement';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if v_stage_name is distinct from 'Client Review' then
    raise exception 'this engagement is not currently in client review';
  end if;

  select id into v_target_stage_id from public.process_stages where process_id = v_process_id and name = 'Filed/Completed';
  if v_target_stage_id is null then
    raise exception 'this pipeline has no Filed/Completed stage configured';
  end if;

  update public.engagements set status = 'Approved' where id = p_engagement_id;
  perform public._advance_pipeline_stage_unchecked('engagement', p_engagement_id, v_process_id, v_target_stage_id);

  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (v_workspace_id, auth.uid(), 'engagement', p_engagement_id, 'CLIENT_REVIEW_APPROVED', 'CLIENT_REVIEW_APPROVED', 'Client approved the prepared return', jsonb_build_object('comment', p_comment));

  perform public._notify_workspace_admins_of_engagement_event(v_workspace_id, p_engagement_id, 'client_review_approved', 'client-review-approved-staff-notification', jsonb_build_object('comment', p_comment));
end;
$function$;

create or replace function public.decline_client_review_filing(p_engagement_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_client_id uuid;
  v_process_id uuid;
  v_stage_name text;
  v_target_stage_id uuid;
begin
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'a reason is required to decline filing';
  end if;

  select workspace_id, client_id, process_id, stage_name
  into v_workspace_id, v_client_id, v_process_id, v_stage_name
  from public._get_engagement_active_stage_name(p_engagement_id);

  if v_workspace_id is null then
    raise exception 'engagement not found or has no active pipeline run';
  end if;
  if not public.is_portal_user(v_client_id) then
    raise exception 'not authorized to respond to this engagement';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if v_stage_name is distinct from 'Client Review' then
    raise exception 'this engagement is not currently in client review';
  end if;

  select id into v_target_stage_id from public.process_stages where process_id = v_process_id and name = 'Declined Filing';
  if v_target_stage_id is null then
    raise exception 'this pipeline has no Declined Filing stage configured';
  end if;

  perform public._advance_pipeline_stage_unchecked('engagement', p_engagement_id, v_process_id, v_target_stage_id);

  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (v_workspace_id, auth.uid(), 'engagement', p_engagement_id, 'CLIENT_REVIEW_FILING_DECLINED', 'CLIENT_REVIEW_FILING_DECLINED', 'Client declined filing', jsonb_build_object('reason', p_reason));

  perform public._notify_workspace_admins_of_engagement_event(v_workspace_id, p_engagement_id, 'client_review_filing_declined', 'client-review-filing-declined-staff-notification', jsonb_build_object('reason', p_reason));
end;
$function$;
