-- Automatic top-up (Part 6): the eligibility scan and charge-idempotency
-- helpers the new app/api/cron/auto-topup-usage cron route calls. Stripe
-- charges can't be made from inside Postgres, so this stays split as
-- "the database decides who's eligible and tracks charge state" +
-- "the cron actually calls Stripe" -- the same shape check-billing-cycles
-- already uses for subscription dunning.

-- find_workspaces_needing_auto_topup: eligibility is fixed at exhaustion
-- (total remaining <= 0) rather than a separate configurable threshold --
-- automatic top-up exists specifically to refill a category just as (not
-- before) it would otherwise hard-stop. Storage's "remaining" is computed
-- the same way check_storage_capacity does (a live byte-sum against
-- capacity), since storage's prepaid_balance is never decremented by usage.
create or replace function public.find_workspaces_needing_auto_topup()
returns table (
  workspace_id uuid,
  resource_type text,
  amount_cents integer,
  stripe_customer_id text,
  default_payment_method_id text,
  rate_cents integer
)
language sql
security definer
stable
set search_path = public
as $$
  select
    m.workspace_id,
    m.resource_type,
    m.auto_topup_amount_cents,
    ws.stripe_customer_id,
    ws.default_payment_method_id,
    case m.resource_type
      when 'email' then p.email_overage_rate_cents_per_1000
      when 'sms' then p.sms_overage_rate_cents
      when 'storage' then p.storage_overage_rate_cents
    end as rate_cents
  from public.workspace_usage_meters m
  join public.workspace_subscriptions ws on ws.workspace_id = m.workspace_id
  join public.platform_subscription_plans p on p.id = ws.plan_id
  where m.auto_topup_enabled
    and m.auto_topup_amount_cents is not null
    and ws.stripe_status = 'active'
    and ws.stripe_customer_id is not null
    and ws.default_payment_method_id is not null
    and (
      (m.resource_type in ('email', 'sms') and (m.free_units_granted - m.free_units_consumed) + m.prepaid_balance <= 0)
      or
      (m.resource_type = 'storage' and (m.free_units_granted + m.prepaid_balance) * 1073741824 <= (
        select coalesce(sum(a.file_size_bytes), 0) from public.attachments a where a.workspace_id = m.workspace_id and a.is_archived = false
      ))
    );
$$;

revoke execute on function public.find_workspaces_needing_auto_topup() from public, anon, authenticated;
grant execute on function public.find_workspaces_needing_auto_topup() to service_role;

-- claim_auto_topup_charge / mark_auto_topup_charge_credited: claim-before-
-- credit, keyed on the Stripe PaymentIntent id (itself made stable across
-- retries within the same window by an Idempotency-Key the cron passes to
-- chargeOffSession). Returns true ("proceed to credit") only the first time
-- a given payment_intent id is seen while still in 'charged' status -- a
-- retry that finds it already 'credited' returns false, so a crash between
-- a successful charge and its balance credit can be resumed without ever
-- crediting twice for the same money.
create or replace function public.claim_auto_topup_charge(
  p_workspace_id uuid,
  p_resource_type text,
  p_stripe_payment_intent_id text,
  p_amount_cents integer,
  p_units numeric
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_status text;
begin
  insert into public.workspace_usage_auto_topup_charges (workspace_id, resource_type, stripe_payment_intent_id, amount_cents, units, status)
  values (p_workspace_id, p_resource_type, p_stripe_payment_intent_id, p_amount_cents, p_units, 'charged')
  on conflict (stripe_payment_intent_id) do nothing;

  select status into v_existing_status
  from public.workspace_usage_auto_topup_charges
  where stripe_payment_intent_id = p_stripe_payment_intent_id;

  return v_existing_status = 'charged';
end;
$$;

create or replace function public.mark_auto_topup_charge_credited(p_stripe_payment_intent_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.workspace_usage_auto_topup_charges
  set status = 'credited', credited_at = now()
  where stripe_payment_intent_id = p_stripe_payment_intent_id;
end;
$$;

revoke execute on function public.claim_auto_topup_charge(uuid, text, text, integer, numeric) from public, anon, authenticated;
revoke execute on function public.mark_auto_topup_charge_credited(text) from public, anon, authenticated;
grant execute on function public.claim_auto_topup_charge(uuid, text, text, integer, numeric) to service_role;
grant execute on function public.mark_auto_topup_charge_credited(text) to service_role;
