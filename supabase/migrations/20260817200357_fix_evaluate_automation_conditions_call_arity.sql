-- 20260817192718_lead_stage_entered_uses_real_pipeline.sql copied the call
-- pattern from an older fire_*_automations trigger that predates
-- evaluate_automation_conditions growing workspace_id/client_id/
-- engagement_id params. Both functions it touched call
-- evaluate_automation_conditions(conditions, context) -- only 2 args --
-- against a function that now requires 5. Since check_function_bodies
-- doesn't catch this at CREATE FUNCTION time here, both would have failed
-- at runtime the first time either trigger actually fired. Caught before
-- either fired for real; fixing the call arity now.

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
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, v_workspace_id, v_client_id, null) then
      insert into public.automation_runs (workspace_id, automation_id, client_id, trigger_snapshot, status)
      values (v_workspace_id, v_automation.id, v_client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

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
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, new.id, null) then
      insert into public.automation_runs (workspace_id, automation_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;
