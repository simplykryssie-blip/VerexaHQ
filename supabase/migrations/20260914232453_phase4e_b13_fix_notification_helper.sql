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
-- Fixes a real bug found before any testing: the previous migration's
-- approve/request-changes/decline RPCs called
-- _notify_admins_of_quote_response(), which is hard-coded to quotes --
-- it looks up public.quotes by the id passed in, and binary-branches
-- "accepted" vs everything else as "declined". Passing an engagement id
-- and a client-review event_type through it would silently produce a
-- wrong notification (empty quote fields, wrong template, entity_type
-- 'quote' pointing at an engagement id). Replaces it with a genuinely
-- generic admin-notification helper built on the real primitive,
-- create_notification(), the same one every other notification path
-- already uses.
create or replace function public._notify_workspace_admins_of_engagement_event(
  p_workspace_id uuid, p_engagement_id uuid, p_event_type text, p_template_key text, p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_recipient record;
begin
  for v_recipient in
    select wu.user_id, u.email from public.workspace_users wu
    join public.roles r on r.id = wu.role_id
    join auth.users u on u.id = wu.user_id
    where wu.workspace_id = p_workspace_id and wu.status = 'active'
      and (wu.is_owner or r.slug in ('owner', 'admin'))
  loop
    perform public.create_notification(
      p_workspace_id, v_recipient.user_id, p_event_type, p_template_key,
      p_payload, array['In-App'::text], 'Medium', 'engagement', p_engagement_id
    );
  end loop;
end;
$function$;

revoke all on function public._notify_workspace_admins_of_engagement_event(uuid, uuid, text, text, jsonb) from public, anon, authenticated;

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

  perform public._notify_workspace_admins_of_engagement_event(v_workspace_id, p_engagement_id, 'client_review_approved', 'client-review-approved-staff-notification', jsonb_build_object('comment', p_comment));
end;
$function$;

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

  perform public._notify_workspace_admins_of_engagement_event(v_workspace_id, p_engagement_id, 'client_review_changes_requested', 'client-review-changes-requested-staff-notification', jsonb_build_object('comment', p_comment));
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

  perform public.advance_pipeline_stage('engagement', p_engagement_id, v_process_id, v_target_stage_id);

  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (v_workspace_id, auth.uid(), 'engagement', p_engagement_id, 'CLIENT_REVIEW_FILING_DECLINED', 'CLIENT_REVIEW_FILING_DECLINED', 'Client declined filing', jsonb_build_object('reason', p_reason));

  perform public._notify_workspace_admins_of_engagement_event(v_workspace_id, p_engagement_id, 'client_review_filing_declined', 'client-review-filing-declined-staff-notification', jsonb_build_object('reason', p_reason));
end;
$function$;
