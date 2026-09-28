-- Payment-first signup: a new customer must complete a genuinely paid
-- Stripe subscription before a Verexa workspace exists at all. Replaces
-- create_paid_workspace's "create the workspace first, suspend it as
-- billing_incomplete, hope they finish Checkout" design (see PR #275's
-- recovery-path fix for the bug that design produced) with:
--
--   signup form -> start_paid_signup (prospect + pending_signups row,
--     no workspace) -> Stripe Checkout -> Stripe confirms a paid
--     subscription -> handleSignupCheckoutCompleted webhook ->
--     provision_workspace_from_pending_signup (atomic) -> workspace exists
--
-- An abandoned/failed/canceled checkout now leaves no workspace, no
-- workspace_users membership, and no workspace-level records of any kind --
-- only the prospect (kept for marketing/nurture) and a 'pending' (or later,
-- cleanup-marked 'abandoned') pending_signups row.
--
-- create_paid_workspace itself is left defined (not dropped) for reference,
-- but its execute grant to `authenticated` is revoked below: leaving it
-- callable would let any signed-in user recreate the exact pre-payment
-- workspace-creation behavior this migration eliminates, via a direct
-- supabase.rpc() call bypassing the app entirely.

-- ============================================================
-- platform_prospects: platform-level marketing/acquisition record.
-- Exists independently of any workspace; not the workspace-scoped `clients`
-- table (a prospect is not a client of any firm). Never deleted on
-- conversion -- it's Verexa's own signup-funnel history.
-- ============================================================
create table public.platform_prospects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id),
  first_name text,
  last_name text,
  email text not null,
  company_name text,
  plan_slug text,
  status text not null default 'signup_started' check (status in ('signup_started', 'checkout_pending', 'abandoned', 'converted')),
  pending_signup_id uuid,
  stripe_checkout_session_id text,
  converted_workspace_id uuid references public.workspaces(id),
  converted_at timestamptz,
  lead_source text,
  -- No consent-collection UI exists yet anywhere in the signup flow -- this
  -- column exists only so a future consent decision has somewhere to land.
  -- Never set true by any code today; do not infer consent from signup.
  marketing_consent boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One live (non-converted) prospect per account -- a retried signup after
-- abandoning a previous attempt updates the same historical row instead of
-- accumulating duplicates. A converted prospect is permanent history, so a
-- later, genuinely new signup attempt by the same person (after e.g. their
-- workspace was deleted) is free to create a fresh row.
create unique index platform_prospects_one_active_per_owner on public.platform_prospects (owner_user_id) where status <> 'converted';
create index platform_prospects_email_idx on public.platform_prospects (email);

create trigger set_updated_at before update on public.platform_prospects for each row execute function public.set_updated_at();

alter table public.platform_prospects enable row level security;

-- Platform-admin-only, matching the existing ai_agent_* visibility pattern.
-- No insert/update/delete policy for any ordinary role -- all writes go
-- through the SECURITY DEFINER functions below.
create policy platform_prospects_select on public.platform_prospects as permissive for select to public using (public.is_platform_admin());

-- ============================================================
-- pending_signups: the minimum needed to safely create a workspace once
-- Stripe confirms payment. Deliberately workspace-shaped (name, plan,
-- owner) but never itself grants workspace access.
-- ============================================================
create table public.pending_signups (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id),
  workspace_name text not null,
  plan_id uuid not null references public.platform_subscription_plans(id),
  first_name text,
  last_name text,
  status text not null default 'pending' check (status in ('pending', 'converted', 'abandoned')),
  stripe_checkout_session_id text,
  workspace_id uuid references public.workspaces(id),
  created_at timestamptz not null default now(),
  converted_at timestamptz
);

-- Enforces "one active pending signup per account" at the database level --
-- a retried signup reuses this row (see start_paid_signup's ON CONFLICT)
-- rather than erroring or creating a second one.
create unique index pending_signups_one_active_per_owner on public.pending_signups (owner_user_id) where status = 'pending';
create index pending_signups_workspace_id_idx on public.pending_signups (workspace_id) where workspace_id is not null;

alter table public.pending_signups enable row level security;

-- Owner can read their own pending signup (the checkout route runs as the
-- signed-in user, not service role); platform admins can see all of them
-- for support. No insert/update/delete policy for ordinary roles --
-- mutations only via the SECURITY DEFINER functions below, which validate
-- ownership/state themselves rather than relying on RLS for write safety.
create policy pending_signups_select on public.pending_signups as permissive for select to public using (owner_user_id = auth.uid() or public.is_platform_admin());

-- ============================================================
-- start_paid_signup: the payment-first replacement for create_paid_workspace
-- as the thing app/signup/page.tsx calls once the user's email is
-- confirmed. Creates a prospect + a pending signup -- explicitly NO
-- workspace, NO workspace_users, NO workspace_subscriptions, NO branding,
-- NO feature flags. Same auth/guard checks create_paid_workspace had.
-- ============================================================
create or replace function public.start_paid_signup(
  p_name text,
  p_plan_slug text,
  p_first_name text default null,
  p_last_name text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_plan_id uuid;
  v_pending_id uuid;
begin
  if v_uid is null then
    raise exception 'start_paid_signup requires an authenticated user';
  end if;

  select email into v_email from auth.users where id = v_uid and email_confirmed_at is not null;
  if v_email is null then
    raise exception 'Please confirm your email before continuing.';
  end if;

  if exists (select 1 from public.client_portal_users where user_id = v_uid and status = 'active') then
    raise exception 'this account is a client portal account and cannot create a staff workspace';
  end if;

  if exists (select 1 from public.workspace_users where user_id = v_uid and status = 'active') then
    raise exception 'This account is already connected to a workspace.';
  end if;

  select id into v_plan_id from public.platform_subscription_plans where slug = p_plan_slug and is_active limit 1;
  if v_plan_id is null then
    raise exception 'Unknown plan: %', p_plan_slug;
  end if;

  insert into public.platform_prospects (owner_user_id, first_name, last_name, email, company_name, plan_slug, status)
  values (v_uid, p_first_name, p_last_name, v_email, p_name, p_plan_slug, 'signup_started')
  on conflict (owner_user_id) where status <> 'converted'
  do update set
    first_name = coalesce(excluded.first_name, public.platform_prospects.first_name),
    last_name = coalesce(excluded.last_name, public.platform_prospects.last_name),
    company_name = excluded.company_name,
    plan_slug = excluded.plan_slug,
    status = 'signup_started',
    updated_at = now();

  insert into public.pending_signups (owner_user_id, workspace_name, plan_id, first_name, last_name)
  values (v_uid, coalesce(nullif(btrim(p_name), ''), 'My Firm'), v_plan_id, p_first_name, p_last_name)
  on conflict (owner_user_id) where status = 'pending'
  do update set
    workspace_name = excluded.workspace_name,
    plan_id = excluded.plan_id,
    first_name = excluded.first_name,
    last_name = excluded.last_name
  returning id into v_pending_id;

  update public.platform_prospects
  set status = 'checkout_pending', pending_signup_id = v_pending_id, updated_at = now()
  where owner_user_id = v_uid and status = 'signup_started';

  return v_pending_id;
end;
$function$;

revoke all on function public.start_paid_signup(text, text, text, text) from public, anon;
grant execute on function public.start_paid_signup(text, text, text, text) to authenticated;

-- ============================================================
-- record_pending_signup_checkout_session: lets the checkout route (running
-- as the signed-in user) attach a Checkout Session id to a pending signup
-- it owns, without granting that user general UPDATE on pending_signups
-- (which would otherwise let them flip status themselves).
-- ============================================================
create or replace function public.record_pending_signup_checkout_session(
  p_pending_signup_id uuid,
  p_stripe_checkout_session_id text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'record_pending_signup_checkout_session requires an authenticated user';
  end if;

  update public.pending_signups
  set stripe_checkout_session_id = p_stripe_checkout_session_id
  where id = p_pending_signup_id and owner_user_id = v_uid and status = 'pending';

  if not found then
    raise exception 'Pending signup not found, not owned by this account, or no longer pending';
  end if;

  update public.platform_prospects
  set stripe_checkout_session_id = p_stripe_checkout_session_id, updated_at = now()
  where pending_signup_id = p_pending_signup_id and owner_user_id = v_uid;
end;
$function$;

revoke all on function public.record_pending_signup_checkout_session(uuid, text) from public, anon;
grant execute on function public.record_pending_signup_checkout_session(uuid, text) to authenticated;

-- ============================================================
-- provision_workspace_from_pending_signup: the ONLY place a workspace gets
-- created for a new signup, called exclusively by the Stripe webhook
-- (service_role) once a subscription is confirmed genuinely paid. Everything
-- create_paid_workspace used to create pre-payment now happens here,
-- post-payment, in one atomic call:
--
--   - row-locks the pending_signups row (`for update`) so two concurrent
--     webhook deliveries for the same pending signup serialize instead of
--     racing;
--   - if already 'converted', returns the existing workspace_id untouched --
--     this is what makes a duplicate/replayed webhook, a retried delivery,
--     or two successful Checkout Sessions for the same pending signup all
--     resolve to AT MOST ONE workspace;
--   - a genuine failure partway through raises, which rolls back this
--     entire call's writes (single plpgsql function = one transaction) and
--     propagates to the caller, which must NOT mark the webhook processed --
--     see handleSignupCheckoutCompleted.
-- ============================================================
create or replace function public.provision_workspace_from_pending_signup(
  p_pending_signup_id uuid,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_stripe_status text,
  p_current_period_start timestamptz default null,
  p_current_period_end timestamptz default null,
  p_trial_end timestamptz default null,
  p_cancel_at_period_end boolean default false,
  p_default_payment_method_id text default null,
  p_card_brand text default null,
  p_card_last4 text default null,
  p_card_exp_month int default null,
  p_card_exp_year int default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pending record;
  v_plan record;
  v_workspace_id uuid;
  v_workspace_type text;
  v_display_name text;
  v_snapshot jsonb;
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'provision_workspace_from_pending_signup can only be called by a service-role caller';
  end if;

  select * into v_pending from public.pending_signups where id = p_pending_signup_id for update;
  if v_pending is null then
    raise exception 'Unknown pending signup: %', p_pending_signup_id;
  end if;

  if v_pending.status = 'converted' then
    return v_pending.workspace_id;
  end if;

  select * into v_plan from public.platform_subscription_plans where id = v_pending.plan_id;
  if v_plan is null then
    raise exception 'Pending signup % references an unknown plan', p_pending_signup_id;
  end if;

  v_workspace_type := case when v_plan.slug = 'solo' then 'independent_ptin' else 'ero_office' end;

  v_workspace_id := public.create_workspace(v_pending.workspace_name, v_workspace_type, 'America/New_York', v_pending.owner_user_id);

  v_snapshot := jsonb_build_object(
    'base_price_cents', v_plan.base_price_cents,
    'per_seat_price_cents', v_plan.per_seat_price_cents,
    'email_overage_rate_cents_per_1000', v_plan.email_overage_rate_cents_per_1000,
    'storage_overage_rate_cents', v_plan.storage_overage_rate_cents,
    'sms_overage_rate_cents', v_plan.sms_overage_rate_cents,
    'currency', v_plan.currency,
    'locked_at', now()
  );

  insert into public.workspace_subscriptions (
    workspace_id, plan_id, stripe_customer_id, stripe_subscription_id, stripe_status,
    current_period_start, current_period_end, trial_end, cancel_at_period_end,
    default_payment_method_id, card_brand, card_last4, card_exp_month, card_exp_year,
    locked_plan_snapshot
  )
  values (
    v_workspace_id, v_pending.plan_id, p_stripe_customer_id, p_stripe_subscription_id, p_stripe_status,
    p_current_period_start, p_current_period_end, p_trial_end, p_cancel_at_period_end,
    p_default_payment_method_id, p_card_brand, p_card_last4, p_card_exp_month, p_card_exp_year,
    v_snapshot
  );

  v_display_name := nullif(btrim(concat_ws(' ', v_pending.first_name, v_pending.last_name)), '');
  if v_pending.first_name is not null or v_pending.last_name is not null then
    update public.user_profiles
    set first_name = coalesce(v_pending.first_name, first_name),
      last_name = coalesce(v_pending.last_name, last_name),
      display_name = coalesce(v_display_name, display_name)
    where id = v_pending.owner_user_id;
  end if;

  update public.pending_signups
  set status = 'converted', workspace_id = v_workspace_id, converted_at = now()
  where id = p_pending_signup_id;

  update public.platform_prospects
  set status = 'converted', converted_workspace_id = v_workspace_id, converted_at = now(), updated_at = now()
  where pending_signup_id = p_pending_signup_id;

  return v_workspace_id;
end;
$function$;

revoke all on function public.provision_workspace_from_pending_signup(uuid, text, text, text, timestamptz, timestamptz, timestamptz, boolean, text, text, text, int, int) from public, anon, authenticated;
grant execute on function public.provision_workspace_from_pending_signup(uuid, text, text, text, timestamptz, timestamptz, timestamptz, boolean, text, text, text, int, int) to service_role;

-- Nothing else calls create_paid_workspace (app/signup/page.tsx is being
-- moved to start_paid_signup in this same change) -- revoking here closes
-- the gap of it otherwise still being directly callable by any signed-in
-- user via supabase.rpc(), which would silently reintroduce pre-payment
-- workspace creation. Left defined (not dropped) for reference/rollback.
revoke execute on function public.create_paid_workspace(text, text, text, text) from authenticated;

-- ============================================================
-- Tax recordkeeping: additive columns for what Stripe Tax exposes on an
-- Invoice once automatic_tax is enabled (see lib/stripe/client.ts). Null on
-- every existing row and on any invoice from before Stripe Tax is actually
-- live (zero tax registrations exist yet -- see the Stripe Tax audit).
-- ============================================================
alter table public.workspace_subscription_invoices
  add column tax_amount integer,
  add column total_excluding_tax integer,
  add column tax_details jsonb;
