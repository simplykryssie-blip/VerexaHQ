-- Phase 2 of the Partner Automation Architecture: enriches only the
-- trigger_snapshot payloads of partner_onboarding.created/.status_changed
-- with relationship_type (both) and package_purchase.package_name
-- (created only). No other producer, no condition/action code, no
-- automation-run identity columns are touched -- those are Phase 1
-- (already shipped) and later phases.
--
-- package_purchase.package_name is deliberately resolved through
-- firm_package_purchase_id (the purchase actually tied to this specific
-- onboarding), never through package_id directly -- package_id can be set
-- on a manually-started onboarding with no real purchase behind it yet,
-- and this field specifically means "the package that was purchased for
-- this onboarding," not "whatever package_id happens to be stored."
-- Stays null when no purchase relationship exists, rather than falling
-- back to package_id's own package name.
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
  v_relationship_type text;
  v_package_name text;
begin
  select w.name, fc.relationship_type into v_buyer_name, v_relationship_type
  from public.firm_connections fc join public.workspaces w on w.id = fc.child_workspace_id
  where fc.id = new.firm_connection_id;

  if new.firm_package_purchase_id is not null then
    select fp.name into v_package_name
    from public.firm_package_purchases fpp
    join public.firm_packages fp on fp.id = fpp.package_id
    where fpp.id = new.firm_package_purchase_id;
  end if;

  v_context := jsonb_build_object(
    'onboarding_id', new.id,
    'connection_id', new.firm_connection_id,
    'relationship_type', v_relationship_type,
    'package_id', new.package_id,
    'package_purchase', jsonb_build_object('package_name', v_package_name),
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
  v_relationship_type text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select w.name, fc.relationship_type into v_buyer_name, v_relationship_type
  from public.firm_connections fc join public.workspaces w on w.id = fc.child_workspace_id
  where fc.id = new.firm_connection_id;

  v_context := jsonb_build_object(
    'onboarding_id', new.id,
    'connection_id', new.firm_connection_id,
    'status', new.status,
    'previous_status', old.status,
    'relationship_type', v_relationship_type,
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
