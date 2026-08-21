-- fire_service_interest_automations() called evaluate_automation_conditions with
-- only 2 args (conditions, context) but the real function takes 5 (conditions,
-- context, workspace_id, client_id, engagement_id). Latent bug -- no automation
-- has ever used trigger_type = 'client.service_interest_selected' yet, so the
-- loop body never ran. About to publish the first one (service-interest ->
-- send_organizer_template), so this must be fixed first or every
-- client_service_interests insert (public organizer contact step, portal basic
-- info step, and the new manual staff intake) will start throwing "function
-- does not exist" and abort the whole insert.
create or replace function public.fire_service_interest_automations()
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
begin
  select id into v_engagement_id from public.engagements
  where client_id = NEW.client_id and status not in ('Completed', 'Archived')
  order by created_at desc limit 1;

  v_context := jsonb_build_object('service_id', NEW.service_id, 'service_category_id', NEW.service_category_id, 'source', NEW.source);

  for v_automation in
    select * from public.automations
    where workspace_id = NEW.workspace_id
      and is_enabled = true
      and status = 'published'
      and trigger_type = 'client.service_interest_selected'
      and trigger_config ->> 'service_id' = NEW.service_id::text
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, NEW.workspace_id, NEW.client_id, v_engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (NEW.workspace_id, v_automation.id, v_engagement_id, NEW.client_id, v_context, 'running')
      returning id into v_run_id;

      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return NEW;
end;
$function$;
