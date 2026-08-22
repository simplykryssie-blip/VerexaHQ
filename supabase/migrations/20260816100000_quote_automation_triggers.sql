-- Quote triggers for the Workflows engine. quotes already has a mature
-- flow (accept_quote/decline_quote RPCs, flip_lead_on_quote_acceptance
-- converting the lead on acceptance, sync_sent_at stamping sent_at) --
-- status vocabulary confirmed as draft -> sent -> accepted/declined.
--
-- quote.sent/accepted/declined are the same underlying event (status
-- changing), so one trigger function evaluates all three automation
-- trigger_types, same approach as the lead status triggers.
create or replace function public.fire_quote_created_automations()
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
  v_context := jsonb_build_object('quote_id', new.id, 'service_id', new.service_id, 'total_amount', new.total_amount);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'quote.created'
      and (trigger_config ->> 'service_id' is null or trigger_config ->> 'service_id' = new.service_id::text)
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.engagement_id, new.client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

create trigger trg_fire_quote_created_automations
  after insert on public.quotes
  for each row execute function public.fire_quote_created_automations();

create or replace function public.fire_quote_status_changed_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_trigger_type text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  v_trigger_type := case new.status
    when 'sent' then 'quote.sent'
    when 'accepted' then 'quote.accepted'
    when 'declined' then 'quote.declined'
    else null
  end;
  if v_trigger_type is null then
    return new;
  end if;

  v_context := jsonb_build_object('quote_id', new.id, 'service_id', new.service_id, 'total_amount', new.total_amount);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = v_trigger_type
      and (trigger_config ->> 'service_id' is null or trigger_config ->> 'service_id' = new.service_id::text)
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context) then
      insert into public.automation_runs (workspace_id, automation_id, engagement_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.engagement_id, new.client_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

create trigger trg_fire_quote_status_changed_automations
  after update of status on public.quotes
  for each row execute function public.fire_quote_status_changed_automations();
