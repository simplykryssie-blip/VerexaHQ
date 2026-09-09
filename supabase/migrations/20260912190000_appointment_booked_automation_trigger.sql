-- appointment.booked: a new trigger distinct from appointment.status_changed
-- so staff can build automations (confirmation text, staff notification,
-- etc.) that fire only when a CLIENT books themselves through a public or
-- portal booking link -- not when staff manually create an appointment on
-- someone's behalf, and not for calendar-sync imports. Both online booking
-- routes (app/api/public/booking/book, app/api/portal/book-appointment)
-- leave created_by and external_source null; every other appointment
-- creation path sets one or the other.
create or replace function public.fire_appointment_status_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
begin
  if not (TG_OP = 'INSERT' or NEW.status is distinct from OLD.status) then
    return NEW;
  end if;

  v_context := jsonb_build_object('status', NEW.status, 'appointment_title', NEW.title);

  for v_automation in
    select * from public.automations
    where workspace_id = NEW.workspace_id
      and is_enabled = true
      and status = 'published'
      and trigger_type = 'appointment.status_changed'
      and trigger_config ->> 'to_status' = NEW.status
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, NEW.workspace_id, NEW.client_id, NEW.engagement_id) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (NEW.workspace_id, v_automation.id, NEW.engagement_id, NEW.client_id, v_context, 'running')
      returning id into v_run_id;

      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  if TG_OP = 'INSERT' and NEW.created_by is null and NEW.external_source is null then
    for v_automation in
      select * from public.automations
      where workspace_id = NEW.workspace_id
        and is_enabled = true
        and status = 'published'
        and trigger_type = 'appointment.booked'
    loop
      if public.evaluate_automation_conditions(v_automation.conditions, v_context, NEW.workspace_id, NEW.client_id, NEW.engagement_id) then
        insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
        values (NEW.workspace_id, v_automation.id, NEW.engagement_id, NEW.client_id, v_context, 'running')
        returning id into v_run_id;

        perform public.start_next_automation_step(v_run_id);
      end if;
    end loop;
  end if;

  return NEW;
end;
$function$;
