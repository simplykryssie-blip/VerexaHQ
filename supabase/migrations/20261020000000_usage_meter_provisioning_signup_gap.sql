-- Release blocker P0 #1: workspace_usage_meters was never created for a
-- brand-new, payment-first self-serve signup. check_storage_capacity and
-- reserve_usage_unit both fail closed (deny) when no meter row exists for a
-- workspace, which blocked document upload, email, and SMS entirely for any
-- workspace provisioned this way.
--
-- Of the three places a workspace can get a usage-bearing plan assigned,
-- upsert_workspace_subscription (the platform-admin manual assign/change
-- plan path) already calls grant_workspace_usage_meters at the end. This
-- migration adds the identical call to the other legitimate path:
-- provision_workspace_from_pending_signup, which is only ever invoked (from
-- handleSignupCheckoutCompleted) after independently re-reading the real
-- Stripe Subscription object and confirming isSubscriptionStatusPaid --
-- i.e. after a genuinely paid subscription, never on checkout.session.completed
-- alone. This mirrors handleInvoicePaymentSucceeded's own existing call and
-- relies on grant_workspace_usage_meters's own
-- ON CONFLICT (workspace_id, resource_type) DO NOTHING, so it is safe even
-- if the workspace's first invoice.payment_succeeded webhook also fires and
-- calls it again later.
--
-- No signature change (avoids the Postgres function-overload pitfall), so
-- this is a pure CREATE OR REPLACE of the existing function body.
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

  -- The fix: this path creates a brand-new workspace with a real, paid plan
  -- attached (see the isSubscriptionStatusPaid gate in
  -- handleSignupCheckoutCompleted), so it must provision usage meters the
  -- same way upsert_workspace_subscription already does for an
  -- admin-assigned plan. Idempotent no-op if already granted.
  perform public.grant_workspace_usage_meters(v_workspace_id);

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

-- Existing-customer repair: MCJ Consulting LLC is a real, active,
-- non-exempt customer whose workspace_subscriptions row already has a
-- plan_id (set by an earlier manual/legacy setup step, predating
-- payment-first signup -- see the platform-admin legacy-billing-migration
-- route, built for exactly this workspace and Doucet Financial Group) but
-- was never granted usage meters, because none of the three provisioning
-- paths applied to it at the time its plan was assigned. This call is
-- scoped by exact workspace name -- not by a stripe_status/plan_id
-- heuristic -- specifically to avoid also granting balances to the ~14
-- disposable "test"/"demo" workspaces left over from prior Stripe testing
-- in this environment, several of which also have a plan_id and an active
-- stripe_status. grant_workspace_usage_meters is already idempotent
-- (ON CONFLICT (workspace_id, resource_type) DO NOTHING) and depends only
-- on workspace_subscriptions.plan_id being set -- not on stripe_status --
-- matching the same precondition upsert_workspace_subscription's own
-- platform-admin-driven grant already relies on.
do $$
declare
  v_workspace_id uuid;
begin
  select id into v_workspace_id
  from public.workspaces
  where name = 'MCJ Consulting LLC';

  if v_workspace_id is not null then
    perform public.grant_workspace_usage_meters(v_workspace_id);
  end if;
end;
$$;
