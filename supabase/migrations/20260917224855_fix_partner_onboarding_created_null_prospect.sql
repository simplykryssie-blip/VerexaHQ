-- Migration Reconciliation Phase 1.10A -- recovered from production.
--
-- v_prospect (a record) was only ever assigned inside the partner_prospect_id
-- branch. When firm_connection_id is the path taken instead (the common
-- case: an existing connected firm buying a package), v_prospect.email/
-- .phone read fields off a record PL/pgSQL never assigned, which raises
-- "record is not assigned yet" and aborts the INSERT trigger -- meaning
-- _get_or_create_partner_onboarding's very first INSERT of a new
-- partner_onboardings row (the common, first-purchase case) always failed,
-- before automation_runs was ever created. Minimal fix: read email/phone
-- into plain nullable text variables inside the branch that has them,
-- instead of off a record that's never assigned on the other branch.
--
-- Confidence: A -- exact original recovered from
-- supabase_migrations.schema_migrations.statements (byte-for-byte).
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
  v_prospect_email text;
  v_prospect_phone text;
begin
  if new.firm_connection_id is not null then
    select w.name, fc.relationship_type into v_buyer_name, v_relationship_type
    from public.firm_connections fc join public.workspaces w on w.id = fc.child_workspace_id
    where fc.id = new.firm_connection_id;
  elsif new.partner_prospect_id is not null then
    select nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), p.email::text, p.phone
    into v_buyer_name, v_prospect_email, v_prospect_phone
    from public.partner_prospects p
    where p.id = new.partner_prospect_id;
  end if;

  if new.firm_package_purchase_id is not null then
    select fp.name into v_package_name
    from public.firm_package_purchases fpp
    join public.firm_packages fp on fp.id = fpp.package_id
    where fpp.id = new.firm_package_purchase_id;
  end if;

  v_context := jsonb_build_object(
    'onboarding_id', new.id,
    'connection_id', new.firm_connection_id,
    'partner_prospect_id', new.partner_prospect_id,
    'relationship_type', v_relationship_type,
    'package_id', new.package_id,
    'package_purchase', jsonb_build_object('package_name', v_package_name),
    'buyer_workspace_name', v_buyer_name,
    'purchaser_name', v_buyer_name,
    'purchaser_email', v_prospect_email,
    'purchaser_phone', v_prospect_phone
  );

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'partner_onboarding.created'
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, null, null, new.firm_connection_id, new.id) then
      insert into public.automation_runs (workspace_id, automation_id, connection_id, partner_prospect_id, onboarding_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.firm_connection_id, new.partner_prospect_id, new.id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;
