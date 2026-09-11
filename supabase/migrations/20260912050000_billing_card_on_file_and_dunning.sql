-- Platform-wide card-on-file + pre-cycle dunning policy.
--
-- Today, billing-failure handling is 100% reactive: Stripe auto-charges a
-- subscription's default payment method exactly on the renewal date, runs
-- its own Smart Retries, and only once Stripe marks the subscription
-- "unpaid" does handleSubscriptionUpdated (subscriptionWebhooks.ts) suspend
-- the workspace. There's no early charge attempt, no reminder before the
-- card is even tried, and no fixed cutoff -- Stripe's retry schedule decides
-- when (or whether) a workspace gets suspended.
--
-- This adds: a saved default payment method per workspace subscription
-- (collected via a Stripe Setup Checkout session, same hosted-redirect
-- pattern as the existing payment/usage-topup checkout flow -- no new
-- frontend Stripe SDK dependency), a ledger of pre-cycle charge attempts,
-- and a needs_billing_card() read RPC for the in-app prompt. The actual
-- charge-3-days-early / remind-5-days-early / suspend-after-cycle-end cron
-- logic lives in app/api/cron/check-billing-cycles (application code, not
-- SQL) since it needs live Stripe calls.
--
-- Mechanism for "charge 3 days early without double-charging on the real
-- renewal date": a successful early charge is applied to the Stripe
-- customer's balance as a credit (createCustomerBalanceCredit). Stripe
-- automatically draws down any customer balance credit against the next
-- invoice before attempting to charge the card, so the real invoice at the
-- actual period end nets to $0 and existing subscription webhooks
-- (handleInvoicePaymentSucceeded etc.) keep working unchanged.

alter table public.workspace_subscriptions
  add column if not exists default_payment_method_id text,
  add column if not exists card_brand text,
  add column if not exists card_last4 text,
  add column if not exists card_exp_month int,
  add column if not exists card_exp_year int;

create table if not exists public.workspace_billing_charge_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  period_end timestamptz not null,
  attempted_at timestamptz not null default now(),
  amount_cents integer not null,
  stripe_payment_intent_id text,
  status text not null check (status in ('succeeded', 'failed')),
  failure_reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_billing_charge_attempts_workspace_period
  on public.workspace_billing_charge_attempts (workspace_id, period_end);

alter table public.workspace_billing_charge_attempts enable row level security;

create policy workspace_billing_charge_attempts_select on public.workspace_billing_charge_attempts
  for select using (public.is_workspace_admin(workspace_id));

-- Tells the in-app prompt whether this workspace needs a card on file:
-- it has a real, live subscription, no saved payment method yet, and isn't
-- currently covered by an ERO's billing_responsibility='ero' connection
-- (a PTIN whose ERO pays never needs its own card).
create or replace function public.needs_billing_card(p_workspace_id uuid)
returns table (
  needed boolean,
  urgent boolean,
  days_until_period_end int,
  period_end timestamptz,
  card_last4 text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_sub record;
  v_covered_by_ero boolean;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'Only a workspace admin can view billing card status';
  end if;

  select ws.stripe_customer_id, ws.default_payment_method_id, ws.current_period_end, ws.card_last4
  into v_sub
  from public.workspace_subscriptions ws
  where ws.workspace_id = p_workspace_id
    and ws.stripe_status in ('active', 'trialing', 'past_due')
  limit 1;

  if v_sub.stripe_customer_id is null then
    return query select false, false, null::int, null::timestamptz, null::text;
    return;
  end if;

  if v_sub.default_payment_method_id is not null then
    return query select false, false, null::int, v_sub.current_period_end, v_sub.card_last4;
    return;
  end if;

  select exists (
    select 1 from public.firm_connections fc
    where fc.child_workspace_id = p_workspace_id
      and fc.relationship_type = 'ero_ptin'
      and fc.status = 'active'
      and fc.billing_responsibility = 'ero'
  ) into v_covered_by_ero;

  if v_covered_by_ero then
    return query select false, false, null::int, v_sub.current_period_end, null::text;
    return;
  end if;

  return query
    select
      true,
      v_sub.current_period_end is not null and v_sub.current_period_end <= now() + interval '5 days',
      case when v_sub.current_period_end is not null then ceil(extract(epoch from (v_sub.current_period_end - now())) / 86400)::int else null end,
      v_sub.current_period_end,
      null::text;
end;
$function$;

revoke all on function public.needs_billing_card(uuid) from public, anon;
grant execute on function public.needs_billing_card(uuid) to authenticated;

-- Global (workspace_id null) system templates, same convention as
-- trial-ending-notice/plan-price-change-notice.
insert into public.email_templates (workspace_id, name, slug, category, subject, body_html, merge_fields, status)
values
  (null, 'Billing Card Reminder', 'billing-card-reminder', 'platform',
   'Add a payment method to your Verexa account',
   E'Hi,\n\nYour Verexa billing cycle renews on {{period_end}}, and there''s no payment method on file. Add a card before then to avoid any interruption to your account.\n\nThank you.',
   '["period_end"]'::jsonb, 'published'),
  (null, 'Billing Payment Failed', 'billing-payment-failed', 'platform',
   'Action needed: your Verexa payment could not be processed',
   E'Hi,\n\nWe were unable to charge the card on file for your Verexa subscription ({{failure_reason}}). Please add a valid payment method before {{period_end}} -- if payment hasn''t gone through by then, your account will be suspended.\n\nThank you.',
   '["failure_reason", "period_end"]'::jsonb, 'published')
on conflict (workspace_id, slug) do nothing;
