-- Isolated bug fix. NOT a functional change to anything except
-- run_automation_test's own error handling on one specific path -- no
-- other function, trigger, grant, or RLS policy is touched.
--
-- Root cause (confirmed live via a savepoint-wrapped repro against
-- production, with GET STACKED DIAGNOSTICS pg_exception_context pinpointing
-- the exact failing statement): automation_runs has a BEFORE INSERT trigger,
-- skip_duplicate_active_automation_run(), that intentionally makes the
-- INSERT a no-op (returns null from the trigger function) when the same
-- client/engagement already has a 'running' row for the same automation --
-- a correct, existing guard against duplicate concurrent runs. But
-- run_automation_test() never checked whether its own
-- "insert ... returning id into v_run_id" actually inserted a row. When the
-- trigger swallowed it, v_run_id stayed null, and the immediately-following
-- "perform start_next_automation_step(v_run_id)" looked up a run that does
-- not exist. That leaves every field of start_next_automation_step's local
-- v_run record null, including workspace_id; v_run.status <> 'running'
-- (null <> 'running' is null, not true) fails to trip the early return, so
-- execution falls through to the operational-gate branch, which then tries
-- to log a 'blocked' row using v_run.workspace_id -- raising "null value in
-- column workspace_id of relation automation_execution_logs violates
-- not-null constraint" instead of any message that tells staff what
-- actually happened.
--
-- Fix: check v_run_id after the insert and raise a clear, accurate
-- exception naming the actual cause -- an already-running test of this same
-- workflow for this client/engagement -- instead of proceeding with a
-- run id that doesn't exist. No change to the trigger, the duplicate-skip
-- policy itself, or anything downstream of a successful insert.
CREATE OR REPLACE FUNCTION public.run_automation_test(p_automation_id uuid, p_client_id uuid, p_engagement_id uuid DEFAULT NULL::uuid, p_webhook_event_type text DEFAULT NULL::text, p_webhook_payload jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_automation record;
  v_client record;
  v_issues record;
  v_context jsonb;
  v_run_id uuid;
  v_interest record;
  v_response record;
  v_doc_request record;
  v_service_id uuid;
  v_integration_id uuid;
begin
  select * into v_automation from public.automations where id = p_automation_id;
  if v_automation.id is null then
    raise exception 'Automation not found';
  end if;
  if not public.has_permission(v_automation.workspace_id, 'automations.manage') then
    raise exception 'You do not have permission to test workflows';
  end if;

  if v_automation.trigger_type <> 'webhook.received' then
    select id, workspace_id into v_client from public.clients where id = p_client_id;
    if v_client.id is null or v_client.workspace_id <> v_automation.workspace_id then
      raise exception 'Client not found in this workspace';
    end if;

    if p_engagement_id is not null and not exists (
      select 1 from public.engagements where id = p_engagement_id and client_id = p_client_id
    ) then
      raise exception 'Engagement does not belong to this client';
    end if;
  end if;

  for v_issues in select * from public.validate_automation(p_automation_id) loop
    raise exception 'Fix this workflow before testing it -- %: %', v_issues.display_name, v_issues.issue;
  end loop;

  if v_automation.trigger_type = 'client.service_interest_selected' then
    select service_id, service_category_id, source into v_interest
    from public.client_service_interests
    where client_id = p_client_id
    order by created_at desc limit 1;
    v_context := jsonb_build_object('service_id', v_interest.service_id, 'service_category_id', v_interest.service_category_id, 'source', v_interest.source);
  elsif v_automation.trigger_type = 'organizer.submitted' then
    select id, organizer_template_id, status into v_response
    from public.organizer_responses
    where client_id = p_client_id and (p_engagement_id is null or engagement_id = p_engagement_id)
    order by created_at desc limit 1;
    v_context := jsonb_build_object('response_id', v_response.id, 'organizer_template_id', v_response.organizer_template_id, 'status', v_response.status);
  elsif v_automation.trigger_type = 'document_request.completed' then
    v_service_id := coalesce(
      (select service_id from public.engagements where id = p_engagement_id),
      (select service_id from public.client_service_interests where client_id = p_client_id order by created_at desc limit 1)
    );
    select id into v_doc_request
    from public.document_requests
    where (p_engagement_id is not null and entity_type = 'engagement' and entity_id = p_engagement_id)
       or (entity_type = 'client' and entity_id = p_client_id)
    order by created_at desc limit 1;
    v_context := jsonb_build_object('document_request_id', v_doc_request.id, 'service_id', v_service_id);
  elsif v_automation.trigger_type = 'webhook.received' then
    v_integration_id := nullif(v_automation.trigger_config->>'integration_id', '')::uuid;
    v_context := jsonb_build_object(
      'webhook_integration_id', v_integration_id,
      'webhook_event_type', coalesce(p_webhook_event_type, v_automation.trigger_config->>'event_type', 'test.event'),
      'webhook_payload', coalesce(p_webhook_payload, '{}'::jsonb)
    );
  else
    v_context := '{}'::jsonb;
  end if;

  v_context := v_context || jsonb_build_object('test_mode', true);

  insert into public.automation_runs (workspace_id, automation_id, client_id, engagement_id, trigger_snapshot, status, is_test)
  values (
    v_automation.workspace_id,
    p_automation_id,
    case when v_automation.trigger_type = 'webhook.received' then null else p_client_id end,
    case when v_automation.trigger_type = 'webhook.received' then null else p_engagement_id end,
    v_context,
    'running',
    true
  )
  returning id into v_run_id;

  if v_run_id is null then
    raise exception 'This client already has an in-progress test (or live run) of this workflow. Wait for it to finish, or clear the stuck run, before starting a new test.';
  end if;

  perform public.start_next_automation_step(v_run_id);

  return v_run_id;
end;
$function$;
