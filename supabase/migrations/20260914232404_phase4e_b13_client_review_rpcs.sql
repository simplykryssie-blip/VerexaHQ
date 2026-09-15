-- Phase 4E / B13: Client Review decision mechanism.
--
-- Pipeline stage names ("Preparation Started", "Client Review") are
-- matched by exact name within the engagement's own active pipeline_run,
-- not hardcoded to one process/workspace -- any workspace whose Tax Prep
-- pipeline uses these stage names (the approved architecture) gets this
-- capability for free, with no per-workspace configuration.
--
-- The revision loop deliberately never moves the pipeline stage backward
-- (move_pipeline_stage/advance_pipeline_stage both forbid it, confirmed
-- live) -- it stays parked at Client Review through as many rounds as
-- needed, cycling engagements.status between 'Waiting On Review' and
-- 'Corrections Requested' (both pre-existing values in the status check
-- constraint), the same "stay at one stage, loop internally" pattern
-- already proven by the Missing Docs/Information reminder chain.
--
-- All four RPCs: explicit is_workspace_operational() check (no
-- suspension bypass), explicit permission/portal-relationship check, and
-- explicit current-state validation before any write -- never trust a
-- caller-supplied stage/status claim.

create or replace function public._get_engagement_active_stage_name(p_engagement_id uuid)
returns table(workspace_id uuid, client_id uuid, process_id uuid, stage_name text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select e.workspace_id, e.client_id, pr.process_id, ps.name
  from public.engagements e
  join public.pipeline_runs pr on pr.entity_type = 'engagement' and pr.entity_id = e.id and pr.status = 'Active'
  join public.pipeline_stages pls on pls.id = pr.current_stage_id
  join public.process_stages ps on ps.id = pls.process_stage_id
  where e.id = p_engagement_id
  order by pr.started_at desc
  limit 1;
$function$;

-- A. Staff marks an engagement ready for client review. Valid from
-- "Preparation Started" (first send) or while already at "Client Review"
-- with status 'Corrections Requested' (re-send after a revision round).
create or replace function public.mark_ready_for_client_review(p_engagement_id uuid)
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
  v_current_status text;
begin
  select workspace_id, client_id, process_id, stage_name
  into v_workspace_id, v_client_id, v_process_id, v_stage_name
  from public._get_engagement_active_stage_name(p_engagement_id);

  if v_workspace_id is null then
    raise exception 'engagement not found or has no active pipeline run';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if not public.has_permission(v_workspace_id, 'engagements.manage') then
    raise exception 'insufficient permissions';
  end if;

  select status into v_current_status from public.engagements where id = p_engagement_id;

  if v_stage_name = 'Preparation Started' then
    select id into v_target_stage_id from public.process_stages where process_id = v_process_id and name = 'Client Review';
    if v_target_stage_id is null then
      raise exception 'this pipeline has no Client Review stage configured';
    end if;
    perform public.advance_pipeline_stage('engagement', p_engagement_id, v_process_id, v_target_stage_id);
  elsif v_stage_name = 'Client Review' and v_current_status = 'Corrections Requested' then
    null; -- already at Client Review; just reset status below
  else
    raise exception 'this engagement is not ready to be sent for client review (currently at % / %)', v_stage_name, v_current_status;
  end if;

  update public.engagements set status = 'Waiting On Review' where id = p_engagement_id;

  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (v_workspace_id, auth.uid(), 'engagement', p_engagement_id, 'CLIENT_REVIEW_READY', 'CLIENT_REVIEW_READY', 'Marked ready for client review', '{}'::jsonb);
end;
$function$;

-- B. Client approves the prepared return.
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
  perform public.advance_pipeline_stage('engagement', p_engagement_id, v_process_id, v_target_stage_id);

  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (v_workspace_id, auth.uid(), 'engagement', p_engagement_id, 'CLIENT_REVIEW_APPROVED', 'CLIENT_REVIEW_APPROVED', 'Client approved the prepared return', jsonb_build_object('comment', p_comment));

  perform public._notify_admins_of_quote_response(v_workspace_id, v_client_id, p_engagement_id, 'client_review_approved');
end;
$function$;

-- C. Client requests changes -- stays at Client Review (no backward
-- pipeline move), status cycles to Corrections Requested so staff can
-- see it and mark_ready_for_client_review can re-send it later.
create or replace function public.request_client_review_changes(p_engagement_id uuid, p_comment text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_client_id uuid;
  v_stage_name text;
begin
  select workspace_id, client_id, stage_name
  into v_workspace_id, v_client_id, v_stage_name
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

  update public.engagements set status = 'Corrections Requested' where id = p_engagement_id;

  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (v_workspace_id, auth.uid(), 'engagement', p_engagement_id, 'CLIENT_REVIEW_CHANGES_REQUESTED', 'CLIENT_REVIEW_CHANGES_REQUESTED', 'Client requested changes to the prepared return', jsonb_build_object('comment', p_comment));

  insert into public.tasks (workspace_id, engagement_id, title, description, priority, due_date)
  values (v_workspace_id, p_engagement_id, 'Revise return per client feedback', coalesce(p_comment, '(no comment provided)'), 'high', (now() + interval '1 day')::date);

  perform public._notify_admins_of_quote_response(v_workspace_id, v_client_id, p_engagement_id, 'client_review_changes_requested');
end;
$function$;

-- D. Client declines filing entirely -- terminal, no re-entry without an
-- explicit staff action (none built; staff can move it manually via the
-- existing generic pipeline UI if a case is later reopened).
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

  perform public.advance_pipeline_stage('engagement', p_engagement_id, v_process_id, v_target_stage_id);

  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (v_workspace_id, auth.uid(), 'engagement', p_engagement_id, 'CLIENT_REVIEW_FILING_DECLINED', 'CLIENT_REVIEW_FILING_DECLINED', 'Client declined filing', jsonb_build_object('reason', p_reason));

  perform public._notify_admins_of_quote_response(v_workspace_id, v_client_id, p_engagement_id, 'client_review_filing_declined');
end;
$function$;

revoke all on function public._get_engagement_active_stage_name(uuid) from public, anon, authenticated;
grant execute on function public.mark_ready_for_client_review(uuid) to authenticated;
grant execute on function public.approve_client_review(uuid, text) to authenticated;
grant execute on function public.request_client_review_changes(uuid, text) to authenticated;
grant execute on function public.decline_client_review_filing(uuid, text) to authenticated;
