-- Wires the Lead subsystem (just made usable) into the Workflows
-- automation engine. Mirrors the existing fire_*_automations pattern
-- exactly: automation_runs already supports client-only runs
-- (engagement_id nullable), same as organizer.submitted/
-- client.portal_created/client.service_interest_selected today.
--
-- "Lead service selected" isn't new -- it's the existing
-- client.service_interest_selected trigger, unchanged.
-- "Lead enters pipeline" isn't added as a separate trigger -- leads have
-- exactly one flat pipeline per workspace (lead_stages), so it would be
-- functionally identical to lead.created.

-- lead.created: fires once, right when a new lead lands (lifecycle_status
-- defaults to 'lead' for every new client).
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
begin
  if new.lifecycle_status <> 'lead' then
    return new;
  end if;

  v_context := jsonb_build_object('lifecycle_status', new.lifecycle_status);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'lead.created'
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

create trigger trg_fire_lead_created_automations
  after insert on public.clients
  for each row execute function public.fire_lead_created_automations();

-- lead.assigned: relationship_manager_id changes while the client is
-- somewhere in the lead pipeline (not yet a plain client reassignment).
create or replace function public.fire_lead_assigned_automations()
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
  if new.relationship_manager_id is not distinct from old.relationship_manager_id then
    return new;
  end if;
  if new.lifecycle_status <> 'lead'
     and not exists (select 1 from public.lead_stages where workspace_id = new.workspace_id and key = new.lifecycle_status) then
    return new;
  end if;

  v_context := jsonb_build_object('assigned_staff_id', new.relationship_manager_id);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'lead.assigned'
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

create trigger trg_fire_lead_assigned_automations
  after update of relationship_manager_id on public.clients
  for each row execute function public.fire_lead_assigned_automations();

-- lead.updated: any field changes while the client was a lead going into
-- this update (also covers the update that moves them out, since that's
-- still a real change to the lead record).
create or replace function public.fire_lead_updated_automations()
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
  if old.lifecycle_status <> 'lead'
     and not exists (select 1 from public.lead_stages where workspace_id = old.workspace_id and key = old.lifecycle_status) then
    return new;
  end if;

  v_context := jsonb_build_object('lifecycle_status', new.lifecycle_status);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'lead.updated'
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

create trigger trg_fire_lead_updated_automations
  after update on public.clients
  for each row execute function public.fire_lead_updated_automations();

-- lead.status_changed / lead.stage_entered / lead.converted_to_client /
-- lead.marked_lost: all four are the same underlying event
-- (lifecycle_status changing), so one trigger evaluates all four
-- automation trigger_types instead of firing four separate triggers off
-- the same UPDATE.
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
  v_is_stage boolean;
  v_was_lead_pipeline boolean;
begin
  if new.lifecycle_status is not distinct from old.lifecycle_status then
    return new;
  end if;

  v_context := jsonb_build_object('to_status', new.lifecycle_status, 'from_status', old.lifecycle_status);
  v_is_stage := exists (select 1 from public.lead_stages where workspace_id = new.workspace_id and key = new.lifecycle_status);
  v_was_lead_pipeline := old.lifecycle_status = 'lead'
    or exists (select 1 from public.lead_stages where workspace_id = old.workspace_id and key = old.lifecycle_status);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and (
        (trigger_type = 'lead.status_changed' and trigger_config ->> 'to_status' = new.lifecycle_status)
        or (v_is_stage and trigger_type = 'lead.stage_entered' and trigger_config ->> 'stage_key' = new.lifecycle_status)
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

create trigger trg_fire_lead_status_changed_automations
  after update of lifecycle_status on public.clients
  for each row execute function public.fire_lead_status_changed_automations();
