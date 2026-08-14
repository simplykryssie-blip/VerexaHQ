-- Second slice of decoupling Engagements ("cases") from Services, following
-- on from a60be8d ("Give Pipelines a native home, independent of Services").
-- That commit let a Pipeline (a `processes` row) be created and edited
-- without a Service in front of it. This one lets an engagement be *opened*
-- without a Service in front of it too: create_engagement's p_service_id
-- becomes optional, and a workspace can instead attach a Pipeline directly
-- (p_process_id) or nothing at all. Services/pricing_rules/billing_rules
-- stay exactly as they are -- this only stops a Service being mandatory in
-- front of an engagement.
--
-- Dropped and recreated (not `create or replace`) because HANDOFF.md flags
-- a prior ambiguous-overload bug on this exact function -- safer to remove
-- the old 6-arg signature outright than risk two overloads coexisting.
drop function if exists public.create_engagement(uuid, uuid, uuid, uuid, engagement_priority, uuid);

create function public.create_engagement(
  p_workspace_id uuid,
  p_client_id uuid,
  p_service_id uuid default null,
  p_assigned_staff_id uuid default null,
  p_priority engagement_priority default 'Medium'::engagement_priority,
  p_billing_rule_id uuid default null,
  p_process_id uuid default null,
  p_case_type text default 'other',
  p_due_date timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
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
    v_process_id := v_service.process_id;
    v_billing_rule_id := coalesce(p_billing_rule_id, v_service.billing_rule_id);
  elsif p_process_id is not null then
    select id into v_process from processes
    where id = p_process_id and (workspace_id is null or workspace_id = p_workspace_id);
    if v_process.id is null then
      raise exception 'pipeline % not found or not accessible in this workspace', p_process_id;
    end if;
    v_process_id := p_process_id;
    v_billing_rule_id := p_billing_rule_id;
  else
    v_process_id := null;
    v_billing_rule_id := p_billing_rule_id;
  end if;

  insert into engagements (workspace_id, client_id, service_id, workflow_id, assigned_staff_id, priority, billing_rule_id, case_type, due_date)
  values (p_workspace_id, p_client_id, p_service_id, v_process_id, p_assigned_staff_id, p_priority, v_billing_rule_id, coalesce(p_case_type, 'other'), p_due_date)
  returning id into v_engagement_id;

  if v_process_id is not null then
    perform start_engagement_workflow(v_engagement_id, v_process_id);
  end if;

  return v_engagement_id;
end;
$$;

grant execute on function public.create_engagement(uuid, uuid, uuid, uuid, engagement_priority, uuid, uuid, text, timestamptz) to authenticated;
