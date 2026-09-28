-- ============================================================================
-- MIGRATION RECONCILIATION PHASE 1.9 -- RECOVERED FROM PRODUCTION (PR #268)
--
-- Did not previously exist in Git main. Applied directly to production
-- during the MKB Tax Prep + Client Review + F1/F2/NW-1 security work
-- (PR #268, branch claude/verexa-schema-mismatch-i8c19u, never merged).
-- Reproduced verbatim from schema_migrations.statements (3816 bytes, exact
-- byte-for-byte match). Confidence: A -- exact original recovered.
--
-- Filename uses the real recorded production version (20260917215736),
-- not the branch's local filename (20261024000000_firm_package_purchase_
-- onboarding_identity.sql) -- a genuine filename/version drift case,
-- already identified in an earlier reconciliation phase.
-- ============================================================================
-- fire_firm_package_purchase_automations() already calls
-- _get_or_create_partner_onboarding() before creating the automation run,
-- but only via `perform` -- its return value (the exact onboarding row this
-- purchase is/was tied to) was discarded, so every resulting automation_runs
-- row got connection_id but onboarding_id = null. Any workflow condition
-- keyed on partner_onboarding.* can never resolve without it (confirmed
-- live: _evaluate_condition_list resolves those fields via p_onboarding_id
-- alone, with no connection_id fallback). Capture and forward the id --
-- no new tables/columns/lookups, the identity was already computed here.
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
  v_onboarding_id uuid;
begin
  if new.status = 'active' and old.status is distinct from 'active' then
    v_event := 'firm_package.purchased';
  elsif new.status = 'canceled' and old.status is distinct from 'canceled' then
    v_event := 'firm_package.canceled';
  else
    return new;
  end if;

  if new.partner_prospect_id is not null and v_event = 'firm_package.purchased' then
    v_event := 'partner_package.purchased';
  end if;

  if v_event in ('firm_package.purchased', 'partner_package.purchased') then
    v_onboarding_id := public._get_or_create_partner_onboarding(new.parent_workspace_id, new.connection_id, new.package_id, new.id, new.partner_prospect_id);
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
    'partner_prospect_id', new.partner_prospect_id,
    'buyer_workspace_name', coalesce(v_buyer_name, new.purchaser_name),
    'amount', new.amount,
    'selected_options', v_selected_labels,
    'purchaser_name', new.purchaser_name,
    'purchaser_email', new.purchaser_email,
    'purchaser_phone', new.purchaser_phone,
    'currency', new.currency,
    'payment_status', new.status,
    'payment_provider', new.payment_provider,
    'payment_reference', new.payment_reference,
    'purchased_at', new.purchased_at,
    'source', new.source,
    'external_customer_id', new.external_customer_id,
    'external_checkout_session_id', new.external_checkout_session_id,
    'external_payment_id', new.external_payment_id
  );

  for v_automation in
    select * from public.automations
    where workspace_id = new.parent_workspace_id and is_enabled = true and status = 'published'
      and trigger_type = v_event
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.parent_workspace_id, null, null, new.connection_id, null) then
      insert into public.automation_runs (workspace_id, automation_id, connection_id, partner_prospect_id, onboarding_id, trigger_snapshot, status)
      values (new.parent_workspace_id, v_automation.id, new.connection_id, new.partner_prospect_id, v_onboarding_id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;
