-- create_engagement silently overrode any explicit p_process_id with
-- the selected service's process_id whenever a service was given --
-- staff had no way to pick a different pipeline for an engagement even
-- though the parameter existed, because the service branch ran first and
-- never looked at p_process_id at all. Per the owner: staff should
-- always manually choose the pipeline, not have it auto-assigned from
-- the service.
--
-- Flips the precedence: an explicit p_process_id now always wins.
-- Falling back to the service's own process_id only when no pipeline was
-- given keeps this non-breaking for any other caller that still expects
-- the old auto-derivation (there are none in this codebase today besides
-- the New Engagement form, which is being updated in this same change to
-- always pass one).

create or replace function public.create_engagement(
  p_workspace_id uuid,
  p_client_id uuid,
  p_service_id uuid default null,
  p_assigned_staff_id uuid default null,
  p_priority engagement_priority default 'Medium',
  p_billing_rule_id uuid default null,
  p_process_id uuid default null,
  p_case_type text default 'other',
  p_due_date timestamptz default null
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
  v_billing_rule_id uuid;
  v_process_id uuid;
begin
  if not has_permission(p_workspace_id, 'engagements.manage') then
    raise exception 'insufficient permissions to create an engagement in this workspace';
  end if;

  if p_service_id is not null then
    select id, process_id, billing_rule_id into v_service from services
    where id = p_service_id and (workspace_id is null or workspace_id = p_workspace_id);
    if v_service.id is null then
      raise exception 'service % not found or not accessible in this workspace', p_service_id;
    end if;
    v_billing_rule_id := coalesce(p_billing_rule_id, v_service.billing_rule_id);
  else
    v_billing_rule_id := p_billing_rule_id;
  end if;

  if p_process_id is not null then
    select id into v_process from processes
    where id = p_process_id and (workspace_id is null or workspace_id = p_workspace_id);
    if v_process.id is null then
      raise exception 'pipeline % not found or not accessible in this workspace', p_process_id;
    end if;
    v_process_id := p_process_id;
  elsif p_service_id is not null then
    v_process_id := v_service.process_id;
  else
    v_process_id := null;
  end if;

  insert into engagements (workspace_id, client_id, service_id, workflow_id, assigned_staff_id, priority, billing_rule_id, case_type, due_date)
  values (p_workspace_id, p_client_id, p_service_id, v_process_id, p_assigned_staff_id, p_priority, v_billing_rule_id, coalesce(p_case_type, 'other'), p_due_date)
  returning id into v_engagement_id;

  if v_process_id is not null then
    perform start_engagement_workflow(v_engagement_id, v_process_id);
  end if;

  return v_engagement_id;
end;
$function$;
