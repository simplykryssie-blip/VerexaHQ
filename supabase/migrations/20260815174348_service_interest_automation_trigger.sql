-- New workflow trigger: "A client selects a service" -- fires whenever a
-- client_service_interests row is inserted (from either the public
-- organizer Contact step or the portal's Basic Info step), matched by the
-- specific service chosen. Lets staff wire e.g. "client selects Monthly
-- bookkeeping -> push the Bookkeeping organizer" without manual triage,
-- reusing the existing send_organizer_template action. Mirrors
-- fire_engagement_created_automations' shape exactly (same service_id
-- match-by-config pattern already used for that trigger).
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
    if public.evaluate_automation_conditions(v_automation.conditions, v_context) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (NEW.workspace_id, v_automation.id, v_engagement_id, NEW.client_id, v_context, 'running')
      returning id into v_run_id;

      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return NEW;
end;
$function$;

drop trigger if exists trg_fire_service_interest_automations on public.client_service_interests;
create trigger trg_fire_service_interest_automations
  after insert on public.client_service_interests
  for each row execute function public.fire_service_interest_automations();
