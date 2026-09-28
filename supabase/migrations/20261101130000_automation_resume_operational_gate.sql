-- Automations reconciliation, remaining item: RLS/operational-gate
-- verification under suspension (Task #11's own item, not static reasoning --
-- found by live-querying every automation-domain mutation RPC's function
-- body for is_workspace_operational and diffing against the established
-- pattern every comparable RPC in this codebase already follows, e.g.
-- create_engagement/create_workflow_pipeline/reorder_automation_step in
-- 20261030010000_operational_gate_rpc_closure.sql and
-- 20261028010000_operational_gate_audit_batch6_git_reconciliation.sql:
-- has_permission() (or is_workspace_admin()) for AUTHORIZATION, plus a
-- separate is_workspace_operational() check for BILLING/SUSPENSION status --
-- neither substitutes for the other, and has_permission() itself does not
-- check operational status (confirmed by reading its body).
--
-- Five automation-domain functions created or reshaped across this
-- reconciliation never picked up that second check, so a suspended
-- (non-paying) workspace could still resume real side effects or provision
-- new integrations:
--   * approve_automation_step / decide_automation_step -- both resume a
--     paused run via execute_automation_step, which can send real email/SMS
--     and perform real mutations for a non-test run.
--   * retry_failed_automation_run -- same: re-invokes execute_automation_step
--     on the failed step.
--   * create_webhook_integration / rotate_webhook_integration_secret --
--     provisioning a new integration or credential, matching the
--     create_engagement/create_workflow_pipeline "no new resource creation
--     while suspended" precedent.
--
-- reject_automation_step is deliberately left untouched -- it only stops a
-- run (sets it to 'cancelled'), the same class of terminal action this
-- codebase already allows regardless of operational status elsewhere (e.g.
-- cancellation/archival paths); blocking it would trap a suspended
-- workspace's paused runs in permanent limbo with no way to close them out.

create or replace function public.approve_automation_step(p_pending_step_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pending record;
  v_step record;
  v_authorized boolean;
begin
  select * into v_pending from public.automation_pending_steps where id = p_pending_step_id and status = 'pending_approval';
  if v_pending.id is null then
    raise exception 'Pending approval not found';
  end if;

  select * into v_step from public.automation_steps where id = v_pending.automation_step_id;

  if v_step.approver_role_id is not null then
    select exists (
      select 1 from public.workspace_users wu
      where wu.workspace_id = v_pending.workspace_id and wu.user_id = auth.uid() and wu.status = 'active' and wu.role_id = v_step.approver_role_id
    ) or public.is_workspace_admin(v_pending.workspace_id) into v_authorized;
  else
    v_authorized := public.is_workspace_admin(v_pending.workspace_id);
  end if;

  if not v_authorized then
    raise exception 'You are not authorized to approve this step';
  end if;

  if not public.is_workspace_operational(v_pending.workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  update public.automation_pending_steps set status = 'completed', approved_by = auth.uid(), approved_at = now() where id = p_pending_step_id;
  perform public.execute_automation_step(v_pending.run_id, v_pending.automation_step_id);

  return jsonb_build_object('ok', true);
end;
$function$;

create or replace function public.decide_automation_step(p_pending_step_id uuid, p_decided_option text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pending record;
  v_step record;
  v_authorized boolean;
  v_options jsonb;
  v_valid boolean;
begin
  select * into v_pending from public.automation_pending_steps where id = p_pending_step_id and status = 'pending_decision';
  if v_pending.id is null then
    raise exception 'Pending decision not found';
  end if;

  select * into v_step from public.automation_steps where id = v_pending.automation_step_id;

  v_options := coalesce(v_step.action_config->'decision_options', '[]'::jsonb);
  select exists(select 1 from jsonb_array_elements(v_options) o where o->>'key' = p_decided_option) into v_valid;
  if not v_valid then
    raise exception 'Not a valid option for this decision step';
  end if;

  if v_step.approver_role_id is not null then
    select exists (
      select 1 from public.workspace_users wu
      where wu.workspace_id = v_pending.workspace_id and wu.user_id = auth.uid() and wu.status = 'active' and wu.role_id = v_step.approver_role_id
    ) or public.is_workspace_admin(v_pending.workspace_id) into v_authorized;
  else
    v_authorized := public.is_workspace_member(v_pending.workspace_id);
  end if;

  if not v_authorized then
    raise exception 'You are not authorized to decide this step';
  end if;

  if not public.is_workspace_operational(v_pending.workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  update public.automation_pending_steps
  set status = 'completed', decided_option = p_decided_option, approved_by = auth.uid(), approved_at = now()
  where id = p_pending_step_id;

  update public.automation_runs
  set trigger_snapshot = coalesce(trigger_snapshot, '{}'::jsonb)
    || jsonb_build_object('decisions', coalesce(trigger_snapshot->'decisions', '{}'::jsonb) || jsonb_build_object(v_step.id::text, p_decided_option))
  where id = v_pending.run_id;

  perform public.start_next_automation_step(v_pending.run_id);

  return jsonb_build_object('ok', true);
end;
$function$;

create or replace function public.retry_failed_automation_run(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_run record;
  v_attempt_number int;
begin
  select * into v_run from public.automation_runs where id = p_run_id;
  if v_run.id is null then
    raise exception 'automation run not found';
  end if;

  if not (
    public.has_permission(v_run.workspace_id, 'automations.manage')
    or public.is_platform_admin()
    or public.is_platform_it()
  ) then
    raise exception 'insufficient permissions to retry this automation run';
  end if;

  if not public.is_workspace_operational(v_run.workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  if v_run.status <> 'failed' then
    raise exception 'this run is not in a failed state';
  end if;
  if v_run.current_step_id is null then
    raise exception 'this run has no step to retry';
  end if;

  select coalesce(max(attempt_number), 0) + 1 into v_attempt_number
  from public.automation_run_retry_attempts where run_id = p_run_id;

  insert into public.automation_run_retry_attempts (run_id, workspace_id, attempt_number, step_id_at_retry, retried_by)
  values (p_run_id, v_run.workspace_id, v_attempt_number, v_run.current_step_id, auth.uid());

  update public.automation_runs set status = 'running', completed_at = null where id = p_run_id;
  perform public.execute_automation_step(p_run_id, v_run.current_step_id);

  return jsonb_build_object('ok', true, 'attempt_number', v_attempt_number);
end;
$function$;

create or replace function public.create_webhook_integration(p_workspace_id uuid, p_provider text, p_name text)
returns table (id uuid, signing_secret text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_secret text;
  v_id uuid;
begin
  if not public.has_permission(p_workspace_id, 'automations.manage') then
    raise exception 'insufficient permissions to create a webhook integration for this workspace';
  end if;
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if p_provider not in ('generic', 'stripe') then
    raise exception 'unsupported provider: %', p_provider;
  end if;

  v_secret := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.webhook_integrations (workspace_id, provider, name, signing_secret, created_by)
  values (p_workspace_id, p_provider, p_name, v_secret, auth.uid())
  returning webhook_integrations.id into v_id;

  return query select v_id, v_secret;
end;
$$;

create or replace function public.rotate_webhook_integration_secret(p_integration_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_workspace_id uuid;
  v_secret text;
begin
  select workspace_id into v_workspace_id from public.webhook_integrations where id = p_integration_id;
  if v_workspace_id is null then
    raise exception 'webhook integration not found';
  end if;
  if not public.has_permission(v_workspace_id, 'automations.manage') then
    raise exception 'insufficient permissions to rotate this webhook integration''s secret';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  v_secret := encode(extensions.gen_random_bytes(32), 'hex');
  update public.webhook_integrations set signing_secret = v_secret where id = p_integration_id;
  return v_secret;
end;
$$;
