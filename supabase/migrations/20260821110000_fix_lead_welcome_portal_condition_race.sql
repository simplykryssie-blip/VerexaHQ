-- Fixes a same-event race in the two lead-welcome automations just added:
-- both are gated on client.portal_status (is_null / is_not_null), but
-- evaluate_automation_conditions resolves that field LIVE against
-- client_portal_users, not from a frozen snapshot. Since
-- fire_lead_created_automations loops over both matching automations in one
-- pass, the "no portal yet" automation's own invite_to_portal step creates
-- the client_portal_users row -- and then, still within the same trigger
-- firing, the "portal already set up" automation's condition re-checks the
-- (now just-created) portal status and incorrectly also fires. Verified
-- live in a rolled-back transaction: a lead with no portal at insert time
-- triggered BOTH automations instead of just one.
--
-- Fix: capture whether a portal existed once, before either automation
-- runs, into the trigger's own context snapshot -- immune to a sibling
-- automation's side effects during the same event -- and repoint both
-- automations' conditions at that frozen value instead of the live field.
create or replace function public.fire_lead_created_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_had_portal boolean;
begin
  if new.lifecycle_status <> 'lead' then
    return new;
  end if;

  v_had_portal := exists (select 1 from public.client_portal_users where client_id = new.id);
  v_context := jsonb_build_object('lifecycle_status', new.lifecycle_status, 'lead.portal_exists_at_creation', v_had_portal);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'lead.created'
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

update public.automations set conditions = '[{"field": "lead.portal_exists_at_creation", "op": "eq", "value": "false"}]'
where id = 'e049a7f8-868d-48a7-95e3-ce012cf0f25b';

update public.automations set conditions = '[{"field": "lead.portal_exists_at_creation", "op": "eq", "value": "true"}]'
where slug = 'new-lead-welcome-has-portal';
