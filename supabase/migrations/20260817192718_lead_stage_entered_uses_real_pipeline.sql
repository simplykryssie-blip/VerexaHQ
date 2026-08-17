-- "A lead enters a pipeline stage" (lead.stage_entered) was keyed off
-- clients.lifecycle_status matching a row in the old flat lead_stages
-- list -- the same uncustomizable system the "Move lead to a pipeline
-- stage" action used to use before it was rewired to lead_pipeline_runs/
-- lead_pipeline_stages (real Pipelines). No workspace has any lead_stages
-- rows and there's no UI to create any, so this trigger was completely
-- unconfigurable/non-functional in practice -- exactly what the user
-- flagged. Rewires it to fire off lead_pipeline_stages the same way
-- engagement.stage_entered fires off workflow_stages, so it's consistent
-- with the action that actually moves leads through pipelines now.

create or replace function public.fire_lead_pipeline_stage_entered_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_client_id uuid;
  v_workspace_id uuid;
begin
  if new.status <> 'In Progress' or old.status is not distinct from 'In Progress' then
    return new;
  end if;

  select lr.client_id, lr.workspace_id into v_client_id, v_workspace_id
  from public.lead_pipeline_runs lr where lr.id = new.lead_pipeline_run_id;

  if v_client_id is null then
    return new;
  end if;

  v_context := jsonb_build_object('process_stage_id', new.process_stage_id);

  for v_automation in
    select * from public.automations
    where workspace_id = v_workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'lead.stage_entered'
      and trigger_config ->> 'process_stage_id' = new.process_stage_id::text
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context) then
      insert into public.automation_runs (workspace_id, automation_id, client_id, trigger_snapshot, status)
      values (v_workspace_id, v_automation.id, v_client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

create trigger trg_fire_lead_pipeline_stage_entered_automations
  after update of status on public.lead_pipeline_stages
  for each row execute function public.fire_lead_pipeline_stage_entered_automations();

-- Drop the old lead_stages-driven branch for lead.stage_entered out of
-- fire_lead_status_changed_automations -- it's now handled by the trigger
-- above instead. lead.status_changed/lead.converted_to_client/
-- lead.marked_lost are untouched.
create or replace function public.fire_lead_status_changed_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_was_lead_pipeline boolean;
begin
  if new.lifecycle_status is not distinct from old.lifecycle_status then
    return new;
  end if;

  v_context := jsonb_build_object('to_status', new.lifecycle_status, 'from_status', old.lifecycle_status);
  v_was_lead_pipeline := old.lifecycle_status = 'lead'
    or exists (select 1 from public.lead_stages where workspace_id = old.workspace_id and key = old.lifecycle_status);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and (
        (trigger_type = 'lead.status_changed' and trigger_config ->> 'to_status' = new.lifecycle_status)
        or (v_was_lead_pipeline and new.lifecycle_status = 'active' and trigger_type = 'lead.converted_to_client')
        or (new.lifecycle_status = 'lost' and trigger_type = 'lead.marked_lost')
      )
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context) then
      insert into public.automation_runs (workspace_id, automation_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;
