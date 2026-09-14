-- Verexa Billing Phase 2: paid staff-seat billing.
--
-- Included seats are keyed by WORKSPACE TYPE (independent_ptin=0,
-- ero_office=3, service_bureau=6) per the locked product decision -- this
-- does NOT match platform_subscription_plans.included_seats, which is keyed
-- by PLAN (solo=1, team=3, firm=6) and is used for something else entirely
-- (a self-serve ero_office workspace can be on the "firm" plan, and the one
-- live service_bureau workspace is on the "firm" plan too, created outside
-- the self-serve create_paid_workspace path, which never produces
-- service_bureau at all). get_included_seats() is the one new, narrow
-- source of truth for this locked mapping; platform_subscription_plans is
-- left completely untouched.
--
-- Additional-seat PRICE is NOT re-invented: platform_subscription_plans.
-- per_seat_price_cents is already a real, configured, non-null value for
-- every plan (solo/team=$39.00, firm=$25.00) -- every workspace has exactly
-- one current plan via workspace_subscriptions.plan_id, so "this workspace's
-- seat price" is simply that plan's per_seat_price_cents, looked up live,
-- never hardcoded in application code.
--
-- Architecture: a SECOND, dedicated Stripe subscription item represents
-- paid staff seats (workspace_subscriptions.seat_addon_subscription_item_id)
-- -- entirely separate from the existing seat_count/primary-item mechanism,
-- which remains exclusively for firm-connection billing takeover and is
-- not touched by any function in this migration.
--
-- Charging model: rather than mutating the live subscription item first and
-- letting Stripe generate a proration invoice (which risks sweeping in
-- unrelated pending invoice items, explicitly warned against), this
-- previews the exact Stripe-computed proration amount via a read-only
-- invoices/upcoming preview (no side effects), charges that exact amount as
-- an isolated one-off off-session PaymentIntent (chargeOffSession, already
-- hardened with an idempotency key in Phase 1), and ONLY on confirmed
-- success updates the real subscription item's quantity with
-- proration_behavior=none (since payment was already collected directly) --
-- so Stripe's subscription state never diverges from what was actually
-- paid, and a failed charge leaves the live subscription completely
-- unmodified (no rollback ever needed).

-- ---------------------------------------------------------------------------
-- get_included_seats: the one locked, workspace-type-keyed mapping.
-- ---------------------------------------------------------------------------
create or replace function public.get_included_seats(p_workspace_type text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case p_workspace_type
    when 'independent_ptin' then 0
    when 'ero_office' then 3
    when 'service_bureau' then 6
    else 0
  end;
$$;

-- ---------------------------------------------------------------------------
-- workspace_subscriptions: the dedicated paid-seat Stripe item id. Nullable
-- -- unset until the first paid seat is ever purchased for this workspace.
-- ---------------------------------------------------------------------------
alter table public.workspace_subscriptions
  add column seat_addon_subscription_item_id text;

-- ---------------------------------------------------------------------------
-- workspace_paid_seats: one row per paid seat. Lifecycle: pending ->
-- active | payment_failed; active -> removed. A payment_failed seat is
-- terminal (never retried in place) -- the admin retries by purchasing a
-- fresh seat, which is simpler and unambiguous than resuming a stale one.
--
-- The partial unique index is the double-click/concurrency guard: only one
-- pending seat may exist per workspace at a time, enforced by the database,
-- not by disabling a button client-side.
-- ---------------------------------------------------------------------------
create table public.workspace_paid_seats (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active', 'payment_failed', 'removed')),
  price_cents_at_purchase integer not null,
  prorated_amount_cents integer,
  stripe_payment_intent_id text,
  failure_reason text,
  created_by uuid references auth.users(id) on delete set null,
  removed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  removed_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index workspace_paid_seats_one_pending_per_workspace
  on public.workspace_paid_seats (workspace_id)
  where status = 'pending';

create unique index workspace_paid_seats_payment_intent_uidx
  on public.workspace_paid_seats (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create index workspace_paid_seats_workspace_status_idx on public.workspace_paid_seats (workspace_id, status);

create trigger set_updated_at before update on public.workspace_paid_seats
  for each row execute function public.set_updated_at();

alter table public.workspace_paid_seats enable row level security;

create policy workspace_paid_seats_select on public.workspace_paid_seats
  for select using (public.is_workspace_admin(workspace_id) or public.is_platform_admin());

create policy workspace_paid_seats_no_direct_write on public.workspace_paid_seats
  for all using (false) with check (false);

-- ---------------------------------------------------------------------------
-- get_workspace_seat_summary: everything the UI needs in one call.
-- Admin-only (seat billing information is restricted, per the locked
-- security rule -- unlike ordinary member-list reads).
-- ---------------------------------------------------------------------------
create or replace function public.get_workspace_seat_summary(p_workspace_id uuid)
returns table (
  included_seats integer,
  active_paid_seats integer,
  pending_seats integer,
  active_staff_count integer,
  per_seat_price_cents integer,
  available_seats integer
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_workspace_type text;
  v_per_seat_price_cents integer;
  v_included integer;
  v_active_paid integer;
  v_pending integer;
  v_active_staff integer;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to view this workspace''s seat billing information';
  end if;

  select w.workspace_type, p.per_seat_price_cents
  into v_workspace_type, v_per_seat_price_cents
  from public.workspaces w
  join public.workspace_subscriptions ws on ws.workspace_id = w.id
  join public.platform_subscription_plans p on p.id = ws.plan_id
  where w.id = p_workspace_id;

  v_included := public.get_included_seats(v_workspace_type);

  select count(*) into v_active_paid from public.workspace_paid_seats where workspace_id = p_workspace_id and status = 'active';
  select count(*) into v_pending from public.workspace_paid_seats where workspace_id = p_workspace_id and status = 'pending';
  select count(*) into v_active_staff from public.workspace_users where workspace_id = p_workspace_id and status = 'active';

  return query select
    v_included,
    v_active_paid,
    v_pending,
    v_active_staff,
    v_per_seat_price_cents,
    greatest(0, (v_included + v_active_paid) - v_active_staff);
end;
$$;

revoke execute on function public.get_workspace_seat_summary(uuid) from public, anon;
grant execute on function public.get_workspace_seat_summary(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- claim_pending_paid_seat: the double-click/concurrency guard in practice.
-- Admin-gated; a second concurrent call while one is already pending
-- raises a clear error rather than silently creating a second charge --
-- the admin retries once the first attempt resolves (the pending row
-- becomes active or payment_failed, freeing the partial unique index).
-- ---------------------------------------------------------------------------
create or replace function public.claim_pending_paid_seat(p_workspace_id uuid)
returns public.workspace_paid_seats
language plpgsql
security definer
set search_path = public
as $$
declare
  v_per_seat_price_cents integer;
  v_seat public.workspace_paid_seats;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to purchase seats for this workspace';
  end if;

  select p.per_seat_price_cents into v_per_seat_price_cents
  from public.workspace_subscriptions ws
  join public.platform_subscription_plans p on p.id = ws.plan_id
  where ws.workspace_id = p_workspace_id;

  if v_per_seat_price_cents is null then
    raise exception 'this workspace has no active plan to price a seat against';
  end if;

  insert into public.workspace_paid_seats (workspace_id, price_cents_at_purchase, created_by)
  values (p_workspace_id, v_per_seat_price_cents, auth.uid())
  on conflict (workspace_id) where status = 'pending' do nothing
  returning * into v_seat;

  if v_seat.id is null then
    raise exception 'a seat purchase is already in progress for this workspace';
  end if;

  return v_seat;
end;
$$;

revoke execute on function public.claim_pending_paid_seat(uuid) from public, anon;
grant execute on function public.claim_pending_paid_seat(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- record_seat_payment_intent: stamps the PaymentIntent id onto the pending
-- seat immediately after the charge is initiated (before checking whether
-- it succeeded), so a crash right after charging still leaves a trail the
-- webhook can find the seat by (via metadata.seat_id primarily -- this
-- column is belt-and-suspenders traceability, per the billing-records
-- requirement, and its own unique index also blocks two different seats
-- ever claiming the same PaymentIntent).
-- ---------------------------------------------------------------------------
create or replace function public.record_seat_payment_intent(p_seat_id uuid, p_stripe_payment_intent_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.workspace_paid_seats
  set stripe_payment_intent_id = p_stripe_payment_intent_id
  where id = p_seat_id and status = 'pending';
$$;

revoke execute on function public.record_seat_payment_intent(uuid, text) from public, anon, authenticated;
grant execute on function public.record_seat_payment_intent(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- activate_paid_seat: the single authoritative activation gate. Both the
-- purchase route's synchronous success path AND the payment_intent.succeeded
-- webhook call this with the same seat id -- the `where status = 'pending'`
-- guard means only whichever call actually executes the transition first
-- gets did_activate = true (the loser is a safe no-op), so exactly one of
-- them performs the Stripe subscription-item quantity bump and sends
-- exactly one notification. This is also what makes a crash-after-payment
-- recoverable: if the route never gets to activate, the webhook's retry
-- (or first delivery) completes it.
-- ---------------------------------------------------------------------------
create or replace function public.activate_paid_seat(
  p_seat_id uuid,
  p_stripe_payment_intent_id text,
  p_prorated_amount_cents integer
)
returns table (did_activate boolean, seat public.workspace_paid_seats)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seat public.workspace_paid_seats;
  v_admin record;
begin
  update public.workspace_paid_seats
  set status = 'active',
      activated_at = now(),
      stripe_payment_intent_id = p_stripe_payment_intent_id,
      prorated_amount_cents = p_prorated_amount_cents
  where id = p_seat_id and status = 'pending'
  returning * into v_seat;

  if v_seat.id is null then
    select * into v_seat from public.workspace_paid_seats where id = p_seat_id;
    return query select false, v_seat;
    return;
  end if;

  select * into v_admin from public.get_workspace_billing_admin(v_seat.workspace_id);
  if v_admin.user_id is not null then
    insert into public.notification_queue (
      workspace_id, channel, channels, template_key, event_type, payload,
      recipient_user_id, recipient_email, dedupe_key
    ) values (
      v_seat.workspace_id, 'Email', array['Email'], 'staff-seat-active', 'staff_seat_active',
      jsonb_build_object('prorated_amount', to_char(coalesce(p_prorated_amount_cents, 0) / 100.0, 'FM$999,999,990.00')),
      v_admin.user_id, v_admin.email, 'staff-seat-active:' || v_seat.id
    );
  end if;

  return query select true, v_seat;
end;
$$;

revoke execute on function public.activate_paid_seat(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.activate_paid_seat(uuid, text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- mark_paid_seat_failed: symmetric to activate_paid_seat -- terminal,
-- idempotent (only transitions a still-pending seat), never activates
-- anything, never touches the live Stripe subscription (nothing was ever
-- committed to it, since quantity is only bumped after success).
-- ---------------------------------------------------------------------------
create or replace function public.mark_paid_seat_failed(p_seat_id uuid, p_failure_reason text)
returns table (did_fail boolean, seat public.workspace_paid_seats)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seat public.workspace_paid_seats;
  v_admin record;
begin
  update public.workspace_paid_seats
  set status = 'payment_failed', failure_reason = p_failure_reason
  where id = p_seat_id and status = 'pending'
  returning * into v_seat;

  if v_seat.id is null then
    select * into v_seat from public.workspace_paid_seats where id = p_seat_id;
    return query select false, v_seat;
    return;
  end if;

  select * into v_admin from public.get_workspace_billing_admin(v_seat.workspace_id);
  if v_admin.user_id is not null then
    insert into public.notification_queue (
      workspace_id, channel, channels, template_key, event_type, payload,
      recipient_user_id, recipient_email, dedupe_key
    ) values (
      v_seat.workspace_id, 'Email', array['Email'], 'staff-seat-payment-failed', 'staff_seat_payment_failed',
      jsonb_build_object('failure_reason', coalesce(p_failure_reason, 'Payment failed')),
      v_admin.user_id, v_admin.email, 'staff-seat-payment-failed:' || v_seat.id
    );
  end if;

  return query select true, v_seat;
end;
$$;

revoke execute on function public.mark_paid_seat_failed(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_paid_seat_failed(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- record_seat_addon_item: stamps workspace_subscriptions with the dedicated
-- Stripe item id the first time it's created. Idempotent (only sets it if
-- not already set, so a later race can't clobber the real id with a stale
-- one from a slower concurrent request -- though claim_pending_paid_seat's
-- one-pending-at-a-time guard already prevents that race for this
-- workspace in practice).
-- ---------------------------------------------------------------------------
create or replace function public.record_seat_addon_item(p_workspace_id uuid, p_stripe_item_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.workspace_subscriptions
  set seat_addon_subscription_item_id = p_stripe_item_id
  where workspace_id = p_workspace_id and seat_addon_subscription_item_id is null;
$$;

revoke execute on function public.record_seat_addon_item(uuid, text) from public, anon, authenticated;
grant execute on function public.record_seat_addon_item(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- release_paid_seat: removal only ever stops FUTURE recurring billing
-- (quantity decrement, proration_behavior none, done in application code
-- via the existing updateSubscriptionItemQuantity) -- never a refund or
-- credit, and deliberately independent of staff release/removal (see
-- release_sponsored_staff_member / revoke_workspace_user, both untouched).
-- ---------------------------------------------------------------------------
create or replace function public.release_paid_seat(p_workspace_id uuid, p_seat_id uuid)
returns public.workspace_paid_seats
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seat public.workspace_paid_seats;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to remove seats from this workspace';
  end if;

  update public.workspace_paid_seats
  set status = 'removed', removed_at = now(), removed_by = auth.uid()
  where id = p_seat_id and workspace_id = p_workspace_id and status = 'active'
  returning * into v_seat;

  if v_seat.id is null then
    raise exception 'this seat is not an active paid seat on this workspace';
  end if;

  return v_seat;
end;
$$;

revoke execute on function public.release_paid_seat(uuid, uuid) from public, anon;
grant execute on function public.release_paid_seat(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Invitation capacity gates. Included seats + active paid seats define
-- total capacity; pending invitations reserve capacity too (so an admin
-- can't oversend invitations against a small remaining allowance), but the
-- check at acceptance time is authoritative (counts only active members,
-- re-verified at the moment a seat is actually consumed).
-- ---------------------------------------------------------------------------
create or replace function public.create_workspace_invitation(p_workspace_id uuid, p_email text, p_role_id uuid)
returns public.workspace_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.workspace_invitations;
  v_workspace_type text;
  v_capacity integer;
  v_in_use integer;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to invite members to this workspace';
  end if;
  if not exists (select 1 from public.roles where id = p_role_id and (workspace_id is null or workspace_id = p_workspace_id)) then
    raise exception 'role does not belong to this workspace';
  end if;

  select workspace_type into v_workspace_type from public.workspaces where id = p_workspace_id;
  v_capacity := public.get_included_seats(v_workspace_type)
    + (select count(*) from public.workspace_paid_seats where workspace_id = p_workspace_id and status = 'active');
  v_in_use := (select count(*) from public.workspace_users where workspace_id = p_workspace_id and status = 'active')
    + (select count(*) from public.workspace_invitations where workspace_id = p_workspace_id and status = 'pending' and lower(email) <> lower(p_email));

  if v_in_use >= v_capacity then
    raise exception 'no available staff seats -- purchase an additional seat before inviting another team member';
  end if;

  insert into public.workspace_invitations (workspace_id, email, role_id, invited_by)
  values (p_workspace_id, lower(p_email), p_role_id, auth.uid())
  on conflict (workspace_id, lower(email)) where status = 'pending'
  do update set role_id = excluded.role_id, invited_by = excluded.invited_by,
    token = gen_random_uuid(), expires_at = now() + interval '7 days', updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.accept_workspace_invitation_by_token(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.workspace_invitations;
  v_user_email text;
  v_workspace_type text;
  v_capacity integer;
  v_in_use integer;
begin
  select * into v_invitation from public.workspace_invitations where token = p_token;

  if v_invitation.id is null then
    raise exception 'invitation not found';
  end if;
  if v_invitation.status <> 'pending' then
    raise exception 'invitation is no longer pending';
  end if;
  if v_invitation.expires_at < now() then
    update public.workspace_invitations set status = 'expired', updated_at = now() where id = v_invitation.id;
    raise exception 'invitation has expired';
  end if;

  select email into v_user_email from auth.users where id = auth.uid();
  if v_user_email is null or lower(v_user_email) <> lower(v_invitation.email) then
    raise exception 'this invitation was sent to a different email address';
  end if;

  -- Locks the subscription row for the duration of the capacity check +
  -- membership insert, so two invitations racing to accept against the
  -- same workspace's last available seat can't both succeed.
  perform 1 from public.workspace_subscriptions where workspace_id = v_invitation.workspace_id for update;

  select workspace_type into v_workspace_type from public.workspaces where id = v_invitation.workspace_id;
  v_capacity := public.get_included_seats(v_workspace_type)
    + (select count(*) from public.workspace_paid_seats where workspace_id = v_invitation.workspace_id and status = 'active');
  -- Re-joining after a prior removal (on conflict do update below) doesn't
  -- consume a second seat -- excluded from the in-use count.
  v_in_use := (select count(*) from public.workspace_users where workspace_id = v_invitation.workspace_id and status = 'active' and user_id <> auth.uid());

  if v_in_use >= v_capacity then
    raise exception 'this workspace has no available staff seats right now -- ask an admin to purchase another seat before accepting';
  end if;

  insert into public.workspace_users (workspace_id, user_id, role_id, status, invited_by, invited_at, joined_at)
  values (v_invitation.workspace_id, auth.uid(), v_invitation.role_id, 'active', v_invitation.invited_by, v_invitation.created_at, now())
  on conflict (workspace_id, user_id) do update
    set role_id = excluded.role_id, status = 'active', joined_at = now();

  if v_invitation.grant_platform_it then
    update public.user_profiles set is_platform_it = true, updated_at = now() where id = auth.uid();
  end if;

  update public.workspace_invitations
  set status = 'accepted', accepted_by = auth.uid(), accepted_at = now(), updated_at = now()
  where id = v_invitation.id;

  return v_invitation.workspace_id;
end;
$$;
