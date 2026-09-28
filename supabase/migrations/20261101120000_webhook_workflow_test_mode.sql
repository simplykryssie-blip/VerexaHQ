-- Automations reconciliation, remaining item: webhook test mode in the
-- Workflow Builder.
--
-- Audited the existing "Run test" flow (run_automation_test,
-- components/workflows/WorkflowBuilder.tsx's runTest/testModalOpen) before
-- changing anything, per instruction. It forces the caller to pick a real
-- client, which is meaningless for a webhook.received-triggered workflow --
-- fire_webhook_automations' own insert into automation_runs never sets
-- client_id (a real webhook-triggered run is always clientless) -- and the
-- function's else-branch leaves trigger_snapshot as an empty '{}' object,
-- so a test run of a webhook-triggered workflow never has anything under
-- webhook_payload/webhook_event_type for its steps to read, and the modal
-- itself blocks the "Run test" button entirely until a client is chosen
-- (ClientPickerField -> disabled={!testClient}) even though the workflow
-- being tested doesn't use one. Confirmed no other trigger type has this
-- forced-but-unused-client problem (the other 3 special-cased branches
-- above -- client.service_interest_selected, organizer.submitted,
-- document_request.completed -- are all genuinely client-scoped, so their
-- existing required-client behavior is correct and untouched).
--
-- Fix: extend run_automation_test (not duplicate it -- same reasoning as
-- every other "extend, don't build a second engine" change this
-- reconciliation has made) with two new optional params carrying a
-- synthetic event type/payload, and make the client requirement
-- conditional on the trigger actually being client-scoped. The synthetic
-- context is shaped exactly like fire_webhook_automations' own v_last_event
-- (top-level webhook_integration_id/webhook_event_type/webhook_payload) so
-- a test run faithfully exercises whatever a real one would see.
--
-- Caught live by run_database_contract_guard immediately after first
-- applying this migration (Task #11/#12 staging verification, not static
-- reasoning): Postgres identifies a function by name + argument TYPE LIST,
-- not by name alone -- appending two new DEFAULT NULL params changes the
-- signature, so `create or replace` did not replace the original 3-arg
-- function at all, it silently added a SECOND, separate overload sitting
-- alongside the untouched original (exactly the "CREATE FUNCTION with a
-- changed arg list instead of a true replacement" drift class the guard's
-- own baseline comment warns about). Worse, the new overload -- being a
-- genuinely new pg_proc row -- picked up Postgres's default EXECUTE-to-
-- PUBLIC grant, which the original function's own migration had long since
-- revoked; confirmed live via pg_proc.proacl showing `anon=X` on the new
-- signature. Both are fixed below: drop the stale 3-arg overload outright
-- (its caller, WorkflowBuilder.tsx's runTest, always calls with the new
-- signature) and explicitly re-revoke/re-grant on the replacement so it
-- carries the exact same authenticated-only, non-public execute contract
-- the original function always had.
drop function if exists public.run_automation_test(uuid, uuid, uuid);

create or replace function public.run_automation_test(
  p_automation_id uuid,
  p_client_id uuid,
  p_engagement_id uuid default null,
  p_webhook_event_type text default null,
  p_webhook_payload jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  perform public.start_next_automation_step(v_run_id);

  return v_run_id;
end;
$function$;

revoke all on function public.run_automation_test(uuid, uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.run_automation_test(uuid, uuid, uuid, text, jsonb) to authenticated, service_role;
