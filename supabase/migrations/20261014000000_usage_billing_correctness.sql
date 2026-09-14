-- Verexa Billing Phase 1: usage-billing correctness.
--
-- Fixes a known, already-flagged bug (grant_workspace_usage_meters firing
-- from customer.subscription.created instead of the first successful
-- payment -- see lib/stripe/subscriptionWebhooks.ts for the corresponding
-- app-side move), and closes two gaps discovered while implementing that
-- fix and while verifying Part 10 (tenant isolation):
--
-- 1. reserve_usage_unit and check_storage_capacity both treated "no meter
--    row exists yet" as UNLIMITED usage (`if not found then return true`) --
--    harmless today only because the old bug granted meters essentially
--    immediately at subscription.created. Once the grant is correctly
--    deferred to first successful payment, that gap becomes a real window
--    of completely unmetered, unbilled usage. Both now deny by default when
--    no meter row exists -- "allowance never granted" becomes its own
--    correctly-zero-capacity state instead of infinite capacity.
--
-- 2. reserve_usage_unit, refund_usage_unit, credit_prepaid_balance,
--    grant_workspace_usage_meters, and check_storage_capacity were all
--    granted EXECUTE to `authenticated` with no internal check that the
--    caller actually belongs to p_workspace_id -- any signed-in user could
--    call e.g. credit_prepaid_balance for an arbitrary workspace_id. All
--    five are only ever called from server-side code using the service-role
--    client (verified: lib/email/resend.ts, lib/sms/twilio.ts,
--    lib/stripe/handleCheckoutCompleted.ts, lib/stripe/subscriptionWebhooks.ts,
--    and the enforce_storage_capacity trigger, which runs SECURITY DEFINER
--    regardless of the inserting user's own grants) -- none are restricted
--    to service_role only.

-- ---------------------------------------------------------------------------
-- Part 10 fix: lock the 5 usage-mutation functions to service_role only.
-- ---------------------------------------------------------------------------
revoke execute on function public.reserve_usage_unit(uuid, text) from public, anon, authenticated;
revoke execute on function public.refund_usage_unit(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.credit_prepaid_balance(uuid, text, numeric) from public, anon, authenticated;
revoke execute on function public.grant_workspace_usage_meters(uuid) from public, anon, authenticated;
revoke execute on function public.check_storage_capacity(uuid, bigint) from public, anon, authenticated;

grant execute on function public.reserve_usage_unit(uuid, text) to service_role;
grant execute on function public.refund_usage_unit(uuid, text, text) to service_role;
grant execute on function public.credit_prepaid_balance(uuid, text, numeric) to service_role;
grant execute on function public.grant_workspace_usage_meters(uuid) to service_role;
grant execute on function public.check_storage_capacity(uuid, bigint) to service_role;

-- ---------------------------------------------------------------------------
-- New columns on workspace_usage_meters:
-- - prepaid_units_granted_lifetime: cumulative prepaid units ever credited
--   (never decremented). Needed only for email/sms's 80% warning math --
--   prepaid_balance itself decreases as it's spent, so "% of total consumed"
--   needs a stable, ever-growing denominator; storage's prepaid_balance is
--   never decremented by usage (storage capacity is a live byte-sum gauge,
--   not a draw-down balance), so storage doesn't need it, but every
--   category gets the column credited uniformly for consistency.
-- - warning_80_sent_at: idempotent dedupe for the 80%-consumed warning,
--   per (workspace, resource_type) -- already category-scoped since meters
--   are. Cleared whenever a top-up lands, since that changes the customer's
--   true capacity and a fresh crossing should warn again -- not a monthly
--   reset (nothing here is time-based), just capacity-based.
-- - auto_topup_enabled / auto_topup_amount_cents: automatic top-up settings,
--   configurable per category by the workspace owner (see
--   set_usage_auto_topup below). Threshold is fixed at exhaustion (total
--   remaining <= 0) rather than a separate configurable field -- automatic
--   top-up exists specifically to refill a category before it hard-stops.
-- ---------------------------------------------------------------------------
alter table public.workspace_usage_meters
  add column prepaid_units_granted_lifetime numeric not null default 0,
  add column warning_80_sent_at timestamptz,
  add column auto_topup_enabled boolean not null default false,
  add column auto_topup_amount_cents integer;

-- ---------------------------------------------------------------------------
-- Usage ledger: durable, append-only explanation of every category balance
-- mutation. No existing table already provides this (workspace_usage_meters
-- only holds current totals, not history). Written to exclusively by the
-- SECURITY DEFINER functions below -- no direct client writes, ever.
--
-- USAGE_RESERVATION_REFUND is an internal reversal (e.g. a vendor send
-- failed after the unit was already deducted) -- explicitly NOT a customer
-- refund or credit; it never appears anywhere customer-facing as either.
-- ---------------------------------------------------------------------------
create table public.workspace_usage_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  resource_type text not null check (resource_type in ('email', 'sms', 'storage')),
  entry_type text not null check (entry_type in (
    'FREE_ALLOWANCE_GRANTED',
    'FREE_ALLOWANCE_CONSUMED',
    'PREPAID_TOPUP',
    'USAGE_CHARGE',
    'USAGE_RESERVATION_REFUND',
    'SMS_MONTHLY_RENTAL',
    'AUTO_TOPUP_FAILED'
  )),
  units numeric not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index workspace_usage_ledger_workspace_idx on public.workspace_usage_ledger (workspace_id, resource_type, created_at desc);

alter table public.workspace_usage_ledger enable row level security;

create policy workspace_usage_ledger_select on public.workspace_usage_ledger
  for select using (public.is_workspace_admin(workspace_id) or public.is_platform_admin());

create policy workspace_usage_ledger_no_direct_write on public.workspace_usage_ledger
  for all using (false) with check (false);

-- ---------------------------------------------------------------------------
-- Automatic top-up charge tracking: idempotency for the auto-topup cron,
-- which (unlike manual top-up's Stripe-Checkout-plus-webhook flow, already
-- covered by Phase 0's claim_stripe_webhook_event) drives an off-session
-- charge directly from server code rather than a webhook. Records the
-- resulting Stripe PaymentIntent id before crediting anything, so a crashed
-- or retried cron tick can tell "already charged and credited" apart from
-- "charged but not yet credited" (finish crediting, don't charge again)
-- from "never charged" (safe to charge) -- the same claim-before-act shape
-- as Phase 0's webhook dedup, applied to a non-webhook-driven charge.
-- ---------------------------------------------------------------------------
create table public.workspace_usage_auto_topup_charges (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  resource_type text not null check (resource_type in ('email', 'sms', 'storage')),
  stripe_payment_intent_id text not null unique,
  amount_cents integer not null,
  units numeric,
  status text not null default 'charged' check (status in ('charged', 'credited', 'failed')),
  created_at timestamptz not null default now(),
  credited_at timestamptz
);

create index workspace_usage_auto_topup_charges_workspace_idx on public.workspace_usage_auto_topup_charges (workspace_id, resource_type);

alter table public.workspace_usage_auto_topup_charges enable row level security;

create policy workspace_usage_auto_topup_charges_select on public.workspace_usage_auto_topup_charges
  for select using (public.is_workspace_admin(workspace_id) or public.is_platform_admin());

create policy workspace_usage_auto_topup_charges_no_direct_write on public.workspace_usage_auto_topup_charges
  for all using (false) with check (false);

-- ---------------------------------------------------------------------------
-- maybe_queue_usage_warning: shared 80%-consumed warning trigger, called by
-- reserve_usage_unit (email/sms) and check_storage_capacity (storage) after
-- they've already computed capacity/consumed for their own purposes.
-- Idempotent via warning_80_sent_at -- fires at most once per category
-- until the next top-up raises capacity and clears the flag. Internal only
-- (service_role); inserts the notification directly into notification_queue
-- with a real, non-null workspace_id and a resolved recipient_email, the
-- same direct-insert shape check-billing-cycles and the sponsorship-
-- transition RPCs already use -- create_notification() does not populate
-- recipient_email and would silently never send (see the sponsorship-
-- transition work earlier this session for the full explanation).
-- ---------------------------------------------------------------------------
create or replace function public.maybe_queue_usage_warning(
  p_workspace_id uuid,
  p_resource_type text,
  p_total_capacity numeric,
  p_total_consumed numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_already_sent timestamptz;
  v_admin record;
  v_resource_label text;
begin
  if p_total_capacity <= 0 then
    return;
  end if;

  if p_total_consumed / p_total_capacity < 0.8 then
    return;
  end if;

  select warning_80_sent_at into v_already_sent
  from public.workspace_usage_meters
  where workspace_id = p_workspace_id and resource_type = p_resource_type;

  if v_already_sent is not null then
    return;
  end if;

  update public.workspace_usage_meters
  set warning_80_sent_at = now()
  where workspace_id = p_workspace_id and resource_type = p_resource_type;

  select * into v_admin from public.get_workspace_billing_admin(p_workspace_id);
  if v_admin.user_id is null then
    return;
  end if;

  v_resource_label := case p_resource_type when 'email' then 'Email' when 'sms' then 'SMS' when 'storage' then 'Storage' else p_resource_type end;

  insert into public.notification_queue (
    workspace_id, channel, channels, template_key, event_type, payload,
    recipient_user_id, recipient_email, dedupe_key
  ) values (
    p_workspace_id, 'Email', array['Email'], 'usage-80-percent-warning', 'usage_80_percent_warning',
    jsonb_build_object('resource_label', v_resource_label, 'resource_type', p_resource_type),
    v_admin.user_id, v_admin.email, 'usage-80-percent-warning:' || p_workspace_id || ':' || p_resource_type || ':' || extract(epoch from now())::bigint
  );
end;
$$;

revoke execute on function public.maybe_queue_usage_warning(uuid, text, numeric, numeric) from public, anon, authenticated;
grant execute on function public.maybe_queue_usage_warning(uuid, text, numeric, numeric) to service_role;

-- ---------------------------------------------------------------------------
-- reserve_usage_unit: now denies (rather than silently allowing) when no
-- meter row exists, writes a ledger entry for whichever source it drew
-- from, and checks the 80% warning after drawing.
-- ---------------------------------------------------------------------------
create or replace function public.reserve_usage_unit(p_workspace_id uuid, p_resource_type text)
returns table (allowed boolean, source text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meter public.workspace_usage_meters%rowtype;
  v_total_capacity numeric;
  v_total_consumed numeric;
begin
  if p_resource_type not in ('email', 'sms') then
    raise exception 'reserve_usage_unit only applies to email/sms -- storage uses check_storage_capacity';
  end if;

  select * into v_meter
  from public.workspace_usage_meters
  where workspace_id = p_workspace_id and resource_type = p_resource_type
  for update;

  if not found then
    -- No allowance has ever been granted for this workspace/category (the
    -- free allowance is only granted after the first successful
    -- subscription payment) -- zero capacity, not unlimited.
    return query select false, null::text;
    return;
  end if;

  if v_meter.free_units_consumed < v_meter.free_units_granted then
    update public.workspace_usage_meters
    set free_units_consumed = free_units_consumed + 1, updated_at = now()
    where id = v_meter.id;

    insert into public.workspace_usage_ledger (workspace_id, resource_type, entry_type, units)
    values (p_workspace_id, p_resource_type, 'FREE_ALLOWANCE_CONSUMED', -1);

    v_total_capacity := v_meter.free_units_granted + v_meter.prepaid_units_granted_lifetime;
    v_total_consumed := (v_meter.free_units_consumed + 1) + (v_meter.prepaid_units_granted_lifetime - v_meter.prepaid_balance);
    perform public.maybe_queue_usage_warning(p_workspace_id, p_resource_type, v_total_capacity, v_total_consumed);

    return query select true, 'free'::text;
    return;
  end if;

  if v_meter.prepaid_balance >= 1 then
    update public.workspace_usage_meters
    set prepaid_balance = prepaid_balance - 1, updated_at = now()
    where id = v_meter.id;

    insert into public.workspace_usage_ledger (workspace_id, resource_type, entry_type, units)
    values (p_workspace_id, p_resource_type, 'USAGE_CHARGE', -1);

    v_total_capacity := v_meter.free_units_granted + v_meter.prepaid_units_granted_lifetime;
    v_total_consumed := v_meter.free_units_consumed + (v_meter.prepaid_units_granted_lifetime - (v_meter.prepaid_balance - 1));
    perform public.maybe_queue_usage_warning(p_workspace_id, p_resource_type, v_total_capacity, v_total_consumed);

    return query select true, 'prepaid'::text;
    return;
  end if;

  return query select false, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- refund_usage_unit: internal reservation reversal only (e.g. the vendor
-- send itself failed after the unit was deducted) -- ledgered as
-- USAGE_RESERVATION_REFUND, never framed as a customer refund or credit.
-- ---------------------------------------------------------------------------
create or replace function public.refund_usage_unit(p_workspace_id uuid, p_resource_type text, p_source text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_source = 'free' then
    update public.workspace_usage_meters
    set free_units_consumed = greatest(0, free_units_consumed - 1), updated_at = now()
    where workspace_id = p_workspace_id and resource_type = p_resource_type;
    insert into public.workspace_usage_ledger (workspace_id, resource_type, entry_type, units, metadata)
    values (p_workspace_id, p_resource_type, 'USAGE_RESERVATION_REFUND', 1, jsonb_build_object('source', 'free'));
  elsif p_source = 'prepaid' then
    update public.workspace_usage_meters
    set prepaid_balance = prepaid_balance + 1, updated_at = now()
    where workspace_id = p_workspace_id and resource_type = p_resource_type;
    insert into public.workspace_usage_ledger (workspace_id, resource_type, entry_type, units, metadata)
    values (p_workspace_id, p_resource_type, 'USAGE_RESERVATION_REFUND', 1, jsonb_build_object('source', 'prepaid'));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- credit_prepaid_balance: ledgers the topup, tracks lifetime prepaid
-- granted (for email/sms's warning math), and clears warning_80_sent_at --
-- a top-up genuinely raises capacity, so a future crossing should warn
-- again. This is a capacity-based reset, not a time-based/monthly one.
-- ---------------------------------------------------------------------------
create or replace function public.credit_prepaid_balance(p_workspace_id uuid, p_resource_type text, p_units numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_usage_meters (workspace_id, resource_type, prepaid_balance, prepaid_units_granted_lifetime)
  values (p_workspace_id, p_resource_type, p_units, p_units)
  on conflict (workspace_id, resource_type) do update
    set prepaid_balance = public.workspace_usage_meters.prepaid_balance + excluded.prepaid_balance,
        prepaid_units_granted_lifetime = public.workspace_usage_meters.prepaid_units_granted_lifetime + excluded.prepaid_units_granted_lifetime,
        warning_80_sent_at = null,
        updated_at = now();

  insert into public.workspace_usage_ledger (workspace_id, resource_type, entry_type, units)
  values (p_workspace_id, p_resource_type, 'PREPAID_TOPUP', p_units);
end;
$$;

-- ---------------------------------------------------------------------------
-- grant_workspace_usage_meters: unchanged allow-once behavior (ON CONFLICT
-- DO NOTHING already made repeated calls safe -- a renewal payment, plan
-- change, seat purchase, or top-up all safely no-op here since the rows
-- already exist), now also ledgers the initial grant.
-- ---------------------------------------------------------------------------
create or replace function public.grant_workspace_usage_meters(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan record;
  v_inserted_types text[];
begin
  select p.signup_free_emails, p.signup_free_sms, p.signup_free_storage_gb
  into v_plan
  from public.workspace_subscriptions ws
  join public.platform_subscription_plans p on p.id = ws.plan_id
  where ws.workspace_id = p_workspace_id;

  if not found then
    return;
  end if;

  with ins as (
    insert into public.workspace_usage_meters (workspace_id, resource_type, free_units_granted)
    values
      (p_workspace_id, 'email', v_plan.signup_free_emails),
      (p_workspace_id, 'sms', v_plan.signup_free_sms),
      (p_workspace_id, 'storage', v_plan.signup_free_storage_gb)
    on conflict (workspace_id, resource_type) do nothing
    returning resource_type, free_units_granted
  )
  select array_agg(resource_type) into v_inserted_types from ins;

  if v_inserted_types is not null and 'email' = any(v_inserted_types) then
    insert into public.workspace_usage_ledger (workspace_id, resource_type, entry_type, units)
    values (p_workspace_id, 'email', 'FREE_ALLOWANCE_GRANTED', v_plan.signup_free_emails);
  end if;
  if v_inserted_types is not null and 'sms' = any(v_inserted_types) then
    insert into public.workspace_usage_ledger (workspace_id, resource_type, entry_type, units)
    values (p_workspace_id, 'sms', 'FREE_ALLOWANCE_GRANTED', v_plan.signup_free_sms);
  end if;
  if v_inserted_types is not null and 'storage' = any(v_inserted_types) then
    insert into public.workspace_usage_ledger (workspace_id, resource_type, entry_type, units)
    values (p_workspace_id, 'storage', 'FREE_ALLOWANCE_GRANTED', v_plan.signup_free_storage_gb);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- check_storage_capacity: denies (rather than silently allowing) when no
-- meter row exists; row-locks the meter for the duration of the check so
-- two concurrent uploads that would together exceed capacity can't both
-- pass (the second blocks until the first's transaction commits, at which
-- point its own fresh byte-sum read reflects the first upload). Also fires
-- the 80% warning -- storage's own prepaid_balance is never decremented by
-- usage (it's a purchased ceiling, not a draw-down balance the way
-- email/sms's is), so its capacity/consumed math is simpler and doesn't
-- need prepaid_units_granted_lifetime.
-- ---------------------------------------------------------------------------
create or replace function public.check_storage_capacity(p_workspace_id uuid, p_additional_bytes bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meter public.workspace_usage_meters%rowtype;
  v_current_bytes bigint;
  v_capacity_bytes numeric;
  v_projected_bytes bigint;
begin
  select * into v_meter
  from public.workspace_usage_meters
  where workspace_id = p_workspace_id and resource_type = 'storage'
  for update;

  if not found then
    return false;
  end if;

  select coalesce(sum(file_size_bytes), 0) into v_current_bytes
  from public.attachments
  where workspace_id = p_workspace_id and is_archived = false;

  v_capacity_bytes := (v_meter.free_units_granted + v_meter.prepaid_balance) * 1073741824;
  v_projected_bytes := v_current_bytes + coalesce(p_additional_bytes, 0);

  if v_projected_bytes > v_capacity_bytes then
    return false;
  end if;

  if v_capacity_bytes > 0 then
    perform public.maybe_queue_usage_warning(p_workspace_id, 'storage', v_capacity_bytes, v_projected_bytes);
  end if;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- bill_and_pause_phone_numbers: unchanged billing math (still the existing
-- $4.99/month literal converted to SMS-equivalent units at the plan's own
-- sms_overage_rate_cents -- see PRODUCT DECISION NEEDED note in the app-side
-- report re: no one-time activation fee existing anywhere to charge), now
-- ledgers each successful monthly rental deduction.
-- ---------------------------------------------------------------------------
create or replace function public.bill_and_pause_phone_numbers(p_workspace_id uuid default null::uuid)
returns table (workspace_id uuid, phone_number text, result text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws record;
  v_num record;
  v_meter record;
  v_rate_cents integer;
  v_units_needed numeric;
begin
  for v_ws in
    select distinct wpn.workspace_id
    from public.workspace_phone_numbers wpn
    where wpn.is_free = false
      and (wpn.last_billed_at is null or wpn.last_billed_at <= now() - interval '1 month')
      and (p_workspace_id is null or wpn.workspace_id = p_workspace_id)
  loop
    select p.sms_overage_rate_cents into v_rate_cents
    from public.workspace_subscriptions ws
    join public.platform_subscription_plans p on p.id = ws.plan_id
    where ws.workspace_id = v_ws.workspace_id;

    if v_rate_cents is null or v_rate_cents <= 0 then
      continue;
    end if;
    v_units_needed := 499.0 / v_rate_cents;

    select * into v_meter
    from public.workspace_usage_meters
    where workspace_id = v_ws.workspace_id and resource_type = 'sms'
    for update;

    if not found then
      continue;
    end if;

    for v_num in
      select *
      from public.workspace_phone_numbers
      where workspace_id = v_ws.workspace_id
        and is_free = false
        and (last_billed_at is null or last_billed_at <= now() - interval '1 month')
      order by created_at asc
    loop
      if v_meter.prepaid_balance >= v_units_needed then
        update public.workspace_usage_meters
        set prepaid_balance = prepaid_balance - v_units_needed, updated_at = now()
        where id = v_meter.id;
        v_meter.prepaid_balance := v_meter.prepaid_balance - v_units_needed;

        insert into public.workspace_usage_ledger (workspace_id, resource_type, entry_type, units, metadata)
        values (v_ws.workspace_id, 'sms', 'SMS_MONTHLY_RENTAL', -v_units_needed, jsonb_build_object('phone_number', v_num.phone_number, 'amount_cents', 499));

        update public.workspace_phone_numbers
        set status = 'active', last_billed_at = now()
        where id = v_num.id;

        workspace_id := v_num.workspace_id;
        phone_number := v_num.phone_number;
        result := 'billed';
        return next;
      else
        update public.workspace_phone_numbers
        set status = 'paused'
        where id = v_num.id;

        workspace_id := v_num.workspace_id;
        phone_number := v_num.phone_number;
        result := 'paused';
        return next;
      end if;
    end loop;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- set_usage_auto_topup: the one usage-billing RPC actually meant to be
-- called by a signed-in client (the workspace owner configuring their own
-- category's automatic top-up) -- gated on is_workspace_admin, exactly like
-- every other owner-facing settings RPC in this codebase.
-- ---------------------------------------------------------------------------
create or replace function public.set_usage_auto_topup(
  p_workspace_id uuid,
  p_resource_type text,
  p_enabled boolean,
  p_amount_cents integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to change this workspace''s auto top-up settings';
  end if;
  if p_resource_type not in ('email', 'sms', 'storage') then
    raise exception 'resourceType must be email, sms, or storage';
  end if;
  if p_enabled and (p_amount_cents is null or p_amount_cents < 2500) then
    raise exception 'auto top-up amount must be at least $25.00';
  end if;

  -- Deliberately an UPDATE, not an upsert -- a meter row only exists once
  -- the free allowance has actually been granted (first successful
  -- payment), and auto top-up settings for a category that's never even
  -- been granted yet don't mean anything. Creating a bare row here would
  -- also break "no row = allowance never granted" elsewhere.
  update public.workspace_usage_meters
  set auto_topup_enabled = p_enabled,
      auto_topup_amount_cents = p_amount_cents,
      updated_at = now()
  where workspace_id = p_workspace_id and resource_type = p_resource_type;

  if not found then
    raise exception 'this workspace has no % allowance yet -- auto top-up isn''t available until after your first successful payment', p_resource_type;
  end if;
end;
$$;

revoke execute on function public.set_usage_auto_topup(uuid, text, boolean, integer) from public, anon;
grant execute on function public.set_usage_auto_topup(uuid, text, boolean, integer) to authenticated;
