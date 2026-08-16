-- User directive: "Automations should be in workflows and should be able
-- to pick clients through pipelines." Adds a new automation trigger type,
-- engagement.stage_entered, so a workflow can fire off "when an
-- engagement enters stage X of pipeline Y" -- this is now the mechanism
-- for pipeline-driven automation, replacing the removed per-stage
-- template pre-selects (see the migration right before this one).
--
-- trigger_config: { "process_id": uuid, "process_stage_id": uuid }.
-- Mirrors the existing fire_*_automations trigger functions exactly.
-- Fires on workflow_stages.status transitioning to 'In Progress', which
-- covers both the very first stage of a newly-started workflow
-- (start_engagement_workflow sets it directly) and every later stage
-- (advance_workflow_on_stage_completed sets the next one when the
-- current stage completes). No trigger-ordering hazard here (unlike
-- engagement.created): workflow_runs/workflow_stages always exist before
-- any status transition can happen on them, so a plain (non-deferred)
-- AFTER UPDATE trigger is correct.
create or replace function public.fire_workflow_stage_entered_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_engagement_id uuid;
  v_client_id uuid;
  v_workspace_id uuid;
begin
  if new.status <> 'In Progress' or old.status is not distinct from 'In Progress' then
    return new;
  end if;

  select wr.engagement_id, wr.workspace_id into v_engagement_id, v_workspace_id
  from public.workflow_runs wr where wr.id = new.workflow_run_id;

  if v_engagement_id is null then
    return new;
  end if;

  select client_id into v_client_id from public.engagements where id = v_engagement_id;

  v_context := jsonb_build_object('process_stage_id', new.process_stage_id);

  for v_automation in
    select * from public.automations
    where workspace_id = v_workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'engagement.stage_entered'
      and trigger_config ->> 'process_stage_id' = new.process_stage_id::text
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (v_workspace_id, v_automation.id, v_engagement_id, v_client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

create trigger trg_fire_workflow_stage_entered_automations
  after update of status on public.workflow_stages
  for each row execute function public.fire_workflow_stage_entered_automations();
