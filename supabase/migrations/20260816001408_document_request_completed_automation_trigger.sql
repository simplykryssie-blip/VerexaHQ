-- Phase 9: staff document review checkpoint. When a document_requests row
-- (scoped to an engagement) transitions to 'completed' -- meaning every
-- required item has been fulfilled, per check_document_request_completion()
-- -- staff should be told to review what came in before the engagement
-- moves into Preparation. No new action_type needed: this just fires the
-- existing create_task action. Deliberately does NOT auto-advance the
-- stage (no change_stage here) -- moving out of document review into
-- active preparation is a human call, not something to automate away.
create or replace function public.fire_document_request_completed_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_engagement_id uuid;
  v_client_id uuid;
  v_service_id uuid;
  v_workspace_id uuid;
begin
  if new.status <> 'completed' or old.status is not distinct from 'completed' then
    return new;
  end if;
  if new.entity_type <> 'engagement' then
    return new;
  end if;

  select workspace_id, client_id, service_id into v_workspace_id, v_client_id, v_service_id
  from public.engagements where id = new.entity_id;

  if v_workspace_id is null then
    return new;
  end if;

  v_engagement_id := new.entity_id;
  v_context := jsonb_build_object('service_id', v_service_id, 'document_request_id', new.id);

  for v_automation in
    select * from public.automations
    where workspace_id = v_workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'document_request.completed'
      and trigger_config ->> 'service_id' = v_service_id::text
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
$$;

drop trigger if exists trg_fire_document_request_completed_automations on public.document_requests;
create trigger trg_fire_document_request_completed_automations
  after update of status on public.document_requests
  for each row execute function public.fire_document_request_completed_automations();
