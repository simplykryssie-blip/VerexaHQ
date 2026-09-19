-- Correction pass, blocker 1: 20261030010000_operational_gate_rpc_closure.sql
-- reproduced create_engagement from the stale 00000000000000 baseline
-- snapshot instead of its actual current definition on main
-- (20260906200000_remove_service_requirements_and_billing_rules.sql, which
-- dropped p_billing_rule_id/engagements.billing_rule_id entirely and
-- changed the signature from 9 to 8 arguments -- a drop+recreate, not a
-- plain replace, since the removed parameter wasn't trailing). Because the
-- 9-arg signature differs from the live 8-arg one, that CREATE OR REPLACE
-- did not patch the real, application-used function at all -- it created
-- a second, additional, broken overload that references the nonexistent
-- engagements.billing_rule_id column and collides ambiguously with the
-- app's actual named-argument call (app/(app)/engagements/new/NewEngagementForm.tsx,
-- which calls the 8-arg overload and never sets p_billing_rule_id).
--
-- Fix: drop the incorrectly-introduced 9-arg overload, and add the
-- lifecycle operational gate to the one function that's actually live and
-- in use -- the 8-arg create_engagement from 20260906200000, reproduced
-- here verbatim except for that one addition.

drop function if exists public.create_engagement(uuid, uuid, uuid, uuid, engagement_priority, uuid, uuid, text, timestamp with time zone);

create or replace function public.create_engagement(
  p_workspace_id uuid,
  p_client_id uuid,
  p_service_id uuid default null::uuid,
  p_assigned_staff_id uuid default null::uuid,
  p_priority engagement_priority default 'Medium'::engagement_priority,
  p_process_id uuid default null::uuid,
  p_case_type text default 'other'::text,
  p_due_date timestamp with time zone default null::timestamp with time zone
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_service record;
  v_process record;
  v_engagement_id uuid;
  v_process_id uuid;
  v_handoff_run_id uuid;
begin
  if not has_permission(p_workspace_id, 'engagements.manage') then
    raise exception 'insufficient permissions to create an engagement in this workspace';
  end if;
  if not is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  if p_service_id is not null then
    select id, process_id into v_service from services
    where id = p_service_id and (workspace_id is null or workspace_id = p_workspace_id);
    if v_service.id is null then raise exception 'service % not found or not accessible in this workspace', p_service_id; end if;
  end if;

  if p_process_id is not null then
    select id into v_process from processes where id = p_process_id and (workspace_id is null or workspace_id = p_workspace_id);
    if v_process.id is null then raise exception 'pipeline % not found or not accessible in this workspace', p_process_id; end if;
    v_process_id := p_process_id;
  elsif p_service_id is not null then
    v_process_id := v_service.process_id;
  else
    v_process_id := null;
  end if;

  insert into engagements (workspace_id, client_id, service_id, workflow_id, assigned_staff_id, priority, case_type, due_date)
  values (p_workspace_id, p_client_id, p_service_id, v_process_id, p_assigned_staff_id, p_priority, coalesce(p_case_type, 'other'), p_due_date)
  returning id into v_engagement_id;

  if v_process_id is not null then
    update pipeline_runs
    set entity_type = 'engagement', entity_id = v_engagement_id
    where entity_type = 'client' and entity_id = p_client_id
      and process_id = v_process_id and status = 'Active'
    returning id into v_handoff_run_id;

    if v_handoff_run_id is not null then
      update pipeline_stages set entity_type = 'engagement' where pipeline_run_id = v_handoff_run_id;
    else
      perform start_pipeline_run('engagement', v_engagement_id, v_process_id);
    end if;
  end if;

  return v_engagement_id;
end;
$function$;
