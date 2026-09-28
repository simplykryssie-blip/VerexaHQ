-- Phase 1 of the Partner Automation Architecture: adds connection_id/
-- onboarding_id as first-class automation_runs identity columns, alongside
-- (never replacing) client_id/engagement_id. A firm_connection can carry
-- multiple partner_onboardings over its lifetime (one per onboarding
-- cycle, once a prior one is rejected/withdrawn -- confirmed live), so
-- connection_id alone cannot pin a run to the exact onboarding journey it
-- belongs to; onboarding_id is what does that.
--
-- ON DELETE SET NULL, not CASCADE: client_id/engagement_id use CASCADE
-- (deleting a client legitimately erases its automation history), but a
-- connection or onboarding record disappearing must never destroy the
-- historical fact that an automation ran -- the same reasoning
-- automation_runs.current_step_id already uses ON DELETE SET NULL for.
alter table public.automation_runs
  add column connection_id uuid references public.firm_connections(id) on delete set null,
  add column onboarding_id uuid references public.partner_onboardings(id) on delete set null;

create index automation_runs_connection_id_idx on public.automation_runs(connection_id) where connection_id is not null;
create index automation_runs_onboarding_id_idx on public.automation_runs(onboarding_id) where onboarding_id is not null;

-- The only two producers that ever touch a firm_package_purchases row --
-- populates connection_id for both the 'purchased' and 'canceled' events;
-- onboarding_id is deliberately left null here (a purchase transitioning
-- doesn't yet know which onboarding it's tied to at the moment this fires;
-- _get_or_create_partner_onboarding runs after, in the same function).
create or replace function public.fire_firm_package_purchase_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_event text;
  v_package record;
  v_buyer_name text;
  v_selected_labels jsonb;
begin
  if new.status = 'active' and old.status is distinct from 'active' then
    v_event := 'firm_package.purchased';
  elsif new.status = 'canceled' and old.status is distinct from 'canceled' then
    v_event := 'firm_package.canceled';
  else
    return new;
  end if;

  if v_event = 'firm_package.purchased' then
    perform public._get_or_create_partner_onboarding(new.parent_workspace_id, new.connection_id, new.package_id, new.id);
  end if;

  select name, billing_cadence into v_package from public.firm_packages where id = new.package_id;
  select name into v_buyer_name from public.workspaces where id = new.workspace_id;
  select coalesce(jsonb_agg(o.label), '[]'::jsonb) into v_selected_labels
    from public.firm_package_options o where o.id = any(coalesce(new.selected_option_ids, '{}'::uuid[]));

  v_context := jsonb_build_object(
    'purchase_id', new.id,
    'package_id', new.package_id,
    'package_purchase.package_name', v_package.name,
    'package_purchase.billing_cadence', coalesce(new.billing_cadence, v_package.billing_cadence),
    'connection_id', new.connection_id,
    'buyer_workspace_name', v_buyer_name,
    'amount', new.amount,
    'selected_options', v_selected_labels
  );

  for v_automation in
    select * from public.automations
    where workspace_id = new.parent_workspace_id and is_enabled = true and status = 'published'
      and trigger_type = v_event
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.parent_workspace_id, null, null) then
      insert into public.automation_runs (workspace_id, automation_id, connection_id, trigger_snapshot, status)
      values (new.parent_workspace_id, v_automation.id, new.connection_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

-- Populates both connection_id and onboarding_id -- both are the actual
-- subject of this event and both are free to obtain directly off the
-- partner_onboardings row that fired the trigger.
create or replace function public.fire_partner_onboarding_created_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_buyer_name text;
begin
  select w.name into v_buyer_name from public.firm_connections fc join public.workspaces w on w.id = fc.child_workspace_id where fc.id = new.firm_connection_id;

  v_context := jsonb_build_object(
    'onboarding_id', new.id,
    'connection_id', new.firm_connection_id,
    'package_id', new.package_id,
    'buyer_workspace_name', v_buyer_name
  );

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'partner_onboarding.created'
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, null, null) then
      insert into public.automation_runs (workspace_id, automation_id, connection_id, onboarding_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.firm_connection_id, new.id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

create or replace function public.fire_partner_onboarding_status_changed_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_buyer_name text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select w.name into v_buyer_name from public.firm_connections fc join public.workspaces w on w.id = fc.child_workspace_id where fc.id = new.firm_connection_id;

  v_context := jsonb_build_object(
    'onboarding_id', new.id,
    'connection_id', new.firm_connection_id,
    'status', new.status,
    'previous_status', old.status,
    'buyer_workspace_name', v_buyer_name
  );

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'partner_onboarding.status_changed'
      and trigger_config ->> 'to_status' = new.status
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, null, null) then
      insert into public.automation_runs (workspace_id, automation_id, connection_id, onboarding_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.firm_connection_id, new.id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;
