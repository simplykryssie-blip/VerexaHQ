-- Phase 4A: implementation for the four billing/suspension blockers found in
-- the Phase 4 Operational Readiness Audit. Every change here is additive --
-- an extra AND-condition or an extra CREATE OR REPLACE preserving the rest
-- of each function -- reusing the existing is_workspace_operational()
-- pattern from Phase 3 rather than inventing a new authorization mechanism.

-- ---------------------------------------------------------------------
-- OBJECTIVE 1: incomplete/abandoned initial checkout must not grant
-- permanent operational access.
--
-- Root cause (proven live in the Phase 4 audit): create_paid_workspace
-- inserts the new workspace with workspaces.status defaulting to 'active'
-- and the workspace_subscriptions row defaulting to stripe_status
-- 'incomplete' -- before Stripe has ever confirmed a real subscription.
-- is_workspace_operational() only looks at workspaces.status, so the
-- workspace is fully operational from the moment it's created, and stays
-- that way forever if the user never completes Stripe Checkout: the
-- dunning cron (check-billing-cycles) and needs_billing_card() both
-- explicitly filter stripe_status IN ('active','trialing','past_due'),
-- which excludes 'incomplete' -- this workspace is invisible to both.
--
-- Fix: create_paid_workspace now creates the workspace already suspended
-- (a new suspension_reason, 'billing_incomplete', distinct from the two
-- existing billing suspension reasons) instead of relying on the 'active'
-- column default. This reuses 100% of the existing suspension
-- infrastructure -- SuspendedWorkspaceScreen, isSuspensionRecoveryPath,
-- is_workspace_operational, workspaceOperationalError -- with zero new
-- gate mechanism. No grace period: the entire signup-to-checkout-redirect
-- flow is a single request/response cycle with no legitimate window where
-- a real user needs operational access before Stripe confirms payment;
-- there is no Stripe/workspace timestamp that would make a timed grace
-- period more correct than an immediate gate, so none is introduced.
--
-- Demo workspaces and connected child workspaces (created via
-- accept_firm_connection_invite) are unaffected: they either have no
-- workspace_subscriptions row at all, or were never routed through
-- create_paid_workspace, so this change never touches their status.
--
-- Recovery reuses the existing Stripe webhook path exactly: the moment
-- checkout succeeds, Stripe fires customer.subscription.created, and
-- handleSubscriptionCreated already calls resumeWorkspaceFromBilling --
-- this migration's TypeScript-side companion change adds
-- 'billing_incomplete' to that call's allowed-reasons list so the exact
-- same, already-existing resume call now also clears this new reason.
-- "Retry checkout" is the existing /api/signup/checkout route, unchanged
-- (it already supports being called again for a non-active subscription);
-- a small UI addition (not part of this migration) surfaces it.

alter table public.workspaces
  drop constraint workspaces_suspension_reason_check;
alter table public.workspaces
  add constraint workspaces_suspension_reason_check
  check (suspension_reason is null or suspension_reason = any (array['billing_past_due'::text, 'subscription_canceled'::text, 'billing_incomplete'::text]));

create or replace function public.set_workspace_status(p_workspace_id uuid, p_status text, p_suspension_reason text default null)
returns public.workspaces
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row public.workspaces;
begin
  if not public.is_platform_admin() then
    raise exception 'insufficient permissions to change workspace status';
  end if;
  if p_status not in ('active', 'suspended', 'archived') then
    raise exception 'invalid status: %', p_status;
  end if;
  if p_suspension_reason is not null and p_suspension_reason not in ('billing_past_due', 'subscription_canceled', 'billing_incomplete') then
    raise exception 'invalid suspension reason: %', p_suspension_reason;
  end if;

  update public.workspaces
  set status = p_status,
      suspension_reason = case when p_status = 'suspended' then p_suspension_reason else null end,
      updated_at = now()
  where id = p_workspace_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'workspace % not found', p_workspace_id;
  end if;

  return v_row;
end;
$$;

create or replace function public.create_paid_workspace(
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
  v_workspace_id uuid;
  v_plan_id uuid;
  v_workspace_type text;
  v_display_name text;
begin
  if v_uid is null then
    raise exception 'create_paid_workspace requires an authenticated user';
  end if;

  if not exists (select 1 from auth.users where id = v_uid and email_confirmed_at is not null) then
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

  v_workspace_type := case when p_plan_slug = 'solo' then 'independent_ptin' else 'ero_office' end;

  v_workspace_id := public.create_workspace(coalesce(nullif(btrim(p_name), ''), 'My Firm'), v_workspace_type);

  -- No trial_end, no current_period_* -- those are only known once the
  -- Stripe subscription the checkout route creates actually exists;
  -- stripe_status keeps the column's 'incomplete' default until then.
  insert into public.workspace_subscriptions (workspace_id, plan_id)
  values (v_workspace_id, v_plan_id);

  -- Phase 4A: the workspace is not operationally usable until that
  -- subscription actually confirms -- see the migration header above.
  update public.workspaces
  set status = 'suspended', suspension_reason = 'billing_incomplete'
  where id = v_workspace_id;

  v_display_name := nullif(btrim(concat_ws(' ', p_first_name, p_last_name)), '');
  if p_first_name is not null or p_last_name is not null or v_display_name is not null then
    update public.user_profiles
    set first_name = coalesce(p_first_name, first_name),
      last_name = coalesce(p_last_name, last_name),
      display_name = coalesce(v_display_name, display_name)
    where id = v_uid;
  end if;

  return v_workspace_id;
end;
$function$;

-- ---------------------------------------------------------------------
-- OBJECTIVE 2: submit_organizer_response() SECURITY DEFINER suspension
-- bypass.
--
-- Proven live in the Phase 4 audit: this function performs its UPDATE
-- directly as a SECURITY DEFINER body, which does not go through the
-- organizer_responses_update RLS policy (Phase 3 already added
-- is_workspace_operational() to that policy, but a SECURITY DEFINER
-- function's own body bypasses table RLS regardless of what the policy
-- says). Fix: add the exact same operational check to the staff branch
-- only, mirroring the surgical OR-wrap pattern Phase 3 already used on
-- the organizer_responses_insert/update RLS policies themselves --
-- portal-client submission is a completely separate function
-- (submit_public_organizer_response) and is untouched.
create or replace function public.submit_organizer_response(p_response_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_client_id uuid;
  v_template_id uuid;
  v_client_name text;
  v_client_email text;
begin
  select workspace_id, client_id, organizer_template_id
    into v_workspace_id, v_client_id, v_template_id
    from public.organizer_responses where id = p_response_id;
  if v_workspace_id is null then
    raise exception 'organizer response not found';
  end if;
  if not (
    (public.has_permission(v_workspace_id, 'engagements.manage') and public.is_workspace_operational(v_workspace_id))
    or public.is_portal_user(v_client_id)
  ) then
    raise exception 'insufficient permissions';
  end if;

  update public.organizer_responses
  set status = 'submitted', submitted_at = now(), updated_at = now()
  where id = p_response_id;

  insert into public.activity_log (workspace_id, entity_type, entity_id, activity_type, description)
  values (v_workspace_id, 'client', v_client_id, 'organizer_submitted', 'Tax organizer submitted');

  select coalesce(nullif(btrim(coalesce(business_name, '')), ''), nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')),
         primary_email
    into v_client_name, v_client_email
    from public.clients where id = v_client_id;

  perform public.resolve_and_sign_organizer_response(p_response_id, v_workspace_id, v_template_id, coalesce(v_client_name, ''), v_client_email);
end;
$function$;

-- ---------------------------------------------------------------------
-- OBJECTIVE 4: firm_connections / firm_packages / invoices suspension
-- enforcement.
--
-- Two independent surfaces, both fixed: (a) the tables' own RLS, closing
-- a direct-Supabase bypass exactly like Phase 3's GAP 1; (b) the
-- SECURITY DEFINER RPCs that manage these tables, which bypass that RLS
-- entirely (same class of gap as Objective 2), so each RPC gets its own
-- explicit check against whichever workspace is actually acting.
--
-- Acting-workspace determination per RPC (worked out before writing any
-- code, per the task's explicit instruction not to blindly check
-- whatever workspace_id happens to be present):
--   create_firm_connection_invite  -- acting workspace = the caller's own
--     workspace issuing the invite (p_workspace_id / parent).
--   redeem_firm_connection_invite  -- acting workspace = the caller's own
--     workspace accepting the invite (p_workspace_id / child). The
--     invite's parent is not re-checked here -- accepting an invitation
--     is the child's own action, not a transaction with the parent's
--     money, unlike a package purchase.
--   disconnect_firm_connection     -- acting workspace = whichever side
--     is actually invoking it (ERO admin -> parent; self-billed PTIN
--     admin -> child) -- checked on that side only, matching the
--     existing v_is_ero_admin/v_is_ptin_admin branching exactly.
--   accept/release_firm_connection_billing -- acting workspace = the ERO
--     (parent) whose own subscription's seat_count is being mutated.
--   assign_firm_package            -- acting workspace = the parent
--     (Service Bureau/ERO) assigning its own package.
alter policy firm_connections_insert on public.firm_connections
  with check (is_workspace_admin(parent_workspace_id) and is_workspace_operational(parent_workspace_id));

alter policy firm_connections_update on public.firm_connections
  using (is_workspace_admin(parent_workspace_id) and is_workspace_operational(parent_workspace_id));

alter policy firm_connections_delete on public.firm_connections
  using (is_workspace_admin(parent_workspace_id) and is_workspace_operational(parent_workspace_id));

alter policy firm_packages_write on public.firm_packages
  with check (is_workspace_admin(workspace_id) and is_service_bureau_workspace(workspace_id) and is_workspace_operational(workspace_id));

alter policy firm_packages_update on public.firm_packages
  using (is_workspace_admin(workspace_id) and is_service_bureau_workspace(workspace_id) and is_workspace_operational(workspace_id))
  with check (is_workspace_admin(workspace_id) and is_service_bureau_workspace(workspace_id) and is_workspace_operational(workspace_id));

alter policy firm_packages_delete on public.firm_packages
  using (is_workspace_admin(workspace_id) and is_service_bureau_workspace(workspace_id) and is_workspace_operational(workspace_id));

alter policy invoices_write on public.invoices
  with check (has_permission(workspace_id, 'billing.manage'::text) and is_workspace_operational(workspace_id));

alter policy invoices_update on public.invoices
  using (has_permission(workspace_id, 'billing.manage'::text) and is_workspace_operational(workspace_id))
  with check (has_permission(workspace_id, 'billing.manage'::text) and is_workspace_operational(workspace_id));

alter policy invoices_delete on public.invoices
  using (is_workspace_admin(workspace_id) and is_workspace_operational(workspace_id));

create or replace function public.create_firm_connection_invite(p_workspace_id uuid, p_relationship_type text default 'ero_ptin'::text)
returns firm_connections
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.firm_connections;
begin
  if not (public.is_workspace_admin(p_workspace_id) and public.is_workspace_operational(p_workspace_id)) then
    raise exception 'insufficient permissions to create a connection invite';
  end if;
  if p_relationship_type not in ('service_bureau_ero', 'ero_ptin', 'service_bureau_ptin') then
    raise exception 'invalid relationship_type';
  end if;

  insert into public.firm_connections (parent_workspace_id, relationship_type, status, invite_token, invite_expires_at, invited_by)
  values (p_workspace_id, p_relationship_type, 'pending', gen_random_uuid(), now() + interval '14 days', auth.uid())
  returning * into v_row;

  return v_row;
end;
$function$;

create or replace function public.redeem_firm_connection_invite(p_token uuid, p_workspace_id uuid)
returns firm_connections
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.firm_connections;
begin
  if not (public.is_workspace_admin(p_workspace_id) and public.is_workspace_operational(p_workspace_id)) then
    raise exception 'insufficient permissions to redeem this invite';
  end if;

  select * into v_row from public.firm_connections
  where invite_token = p_token and status = 'pending' and child_workspace_id is null
  for update;

  if v_row.id is null then
    raise exception 'This invite is invalid or has already been used.';
  end if;
  if v_row.invite_expires_at < now() then
    raise exception 'This invite has expired.';
  end if;
  if v_row.parent_workspace_id = p_workspace_id then
    raise exception 'A workspace cannot connect to itself.';
  end if;
  if exists (
    select 1 from public.firm_connections
    where child_workspace_id = p_workspace_id
      and relationship_type = v_row.relationship_type
      and status = 'active'
  ) then
    raise exception 'This workspace is already connected to an ERO.';
  end if;

  update public.firm_connections
  set child_workspace_id = p_workspace_id,
      status = 'active',
      responded_by = auth.uid(),
      responded_at = now(),
      invite_token = null,
      updated_at = now()
  where id = v_row.id
  returning * into v_row;

  perform public.create_notification(
    v_row.parent_workspace_id, v_row.invited_by, 'FIRM_CONNECTION_ACCEPTED',
    'firm_connection_accepted', jsonb_build_object('firm_connection_id', v_row.id),
    array['In-App'::text], 'Medium', 'firm_connection', v_row.id
  );

  return v_row;
end;
$function$;

create or replace function public.disconnect_firm_connection(p_connection_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.firm_connections;
  v_is_ero_admin boolean;
  v_is_ptin_admin boolean;
begin
  select * into v_row from public.firm_connections where id = p_connection_id for update;
  if v_row.id is null then
    raise exception 'connection not found';
  end if;

  v_is_ero_admin := public.is_workspace_admin(v_row.parent_workspace_id) and public.is_workspace_operational(v_row.parent_workspace_id);
  v_is_ptin_admin := public.is_workspace_admin(v_row.child_workspace_id) and public.is_workspace_operational(v_row.child_workspace_id) and v_row.billing_responsibility <> 'ero';

  if not (v_is_ero_admin or v_is_ptin_admin) then
    raise exception 'Only the ERO, or an independently-billed PTIN, can disconnect this connection.';
  end if;

  if v_row.billing_responsibility = 'ero' then
    update public.workspace_subscriptions set seat_count = greatest(coalesce(seat_count, 1) - 1, 0), updated_at = now() where workspace_id = v_row.parent_workspace_id;
  end if;

  update public.firm_connections
  set status = 'revoked',
      billing_responsibility = 'ptin_self',
      responded_by = auth.uid(),
      responded_at = now(),
      updated_at = now()
  where id = p_connection_id;

  if v_is_ptin_admin and not v_is_ero_admin then
    if v_row.invited_by is not null then
      perform public.create_notification(
        v_row.parent_workspace_id, v_row.invited_by, 'FIRM_CONNECTION_REVOKED',
        'firm_connection_revoked', jsonb_build_object('firm_connection_id', p_connection_id),
        array['In-App'::text], 'Medium', 'firm_connection', p_connection_id
      );
    end if;
  else
    if v_row.responded_by is not null then
      perform public.create_notification(
        v_row.child_workspace_id, v_row.responded_by, 'FIRM_CONNECTION_REVOKED',
        'firm_connection_revoked', jsonb_build_object('firm_connection_id', p_connection_id),
        array['In-App'::text], 'Medium', 'firm_connection', p_connection_id
      );
    end if;
  end if;
end;
$function$;

create or replace function public.accept_firm_connection_billing(p_connection_id uuid)
returns firm_connections
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.firm_connections;
begin
  select * into v_row from public.firm_connections where id = p_connection_id for update;
  if v_row.id is null then
    raise exception 'connection not found';
  end if;
  if not (public.is_workspace_admin(v_row.parent_workspace_id) and public.is_workspace_operational(v_row.parent_workspace_id)) then
    raise exception 'Only the ERO can accept billing for this connection.';
  end if;
  if v_row.status <> 'active' then
    raise exception 'Only an active connection can have its billing accepted.';
  end if;
  if v_row.billing_responsibility = 'ero' then
    return v_row;
  end if;

  if not exists (select 1 from public.workspace_subscriptions where workspace_id = v_row.parent_workspace_id) then
    raise exception 'This ERO has no active subscription to bill the seat against.';
  end if;

  update public.firm_connections set billing_responsibility = 'ero', updated_at = now() where id = p_connection_id returning * into v_row;
  update public.workspace_subscriptions set seat_count = coalesce(seat_count, 0) + 1, updated_at = now() where workspace_id = v_row.parent_workspace_id;

  if v_row.responded_by is not null then
    perform public.create_notification(
      v_row.child_workspace_id, v_row.responded_by, 'FIRM_CONNECTION_BILLING_ACCEPTED',
      'firm_connection_billing_accepted', jsonb_build_object('firm_connection_id', p_connection_id),
      array['In-App'::text], 'Medium', 'firm_connection', p_connection_id
    );
  end if;

  return v_row;
end;
$function$;

create or replace function public.release_firm_connection_billing(p_connection_id uuid)
returns firm_connections
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row public.firm_connections;
begin
  select * into v_row from public.firm_connections where id = p_connection_id for update;
  if v_row.id is null then
    raise exception 'connection not found';
  end if;
  if not (public.is_workspace_admin(v_row.parent_workspace_id) and public.is_workspace_operational(v_row.parent_workspace_id)) then
    raise exception 'Only the ERO can release billing for this connection.';
  end if;
  if v_row.billing_responsibility <> 'ero' then
    return v_row;
  end if;

  update public.firm_connections set billing_responsibility = 'ptin_self', updated_at = now() where id = p_connection_id returning * into v_row;
  update public.workspace_subscriptions set seat_count = greatest(coalesce(seat_count, 1) - 1, 0), updated_at = now() where workspace_id = v_row.parent_workspace_id;

  if v_row.responded_by is not null then
    perform public.create_notification(
      v_row.child_workspace_id, v_row.responded_by, 'FIRM_CONNECTION_BILLING_RELEASED',
      'firm_connection_billing_released', jsonb_build_object('firm_connection_id', p_connection_id),
      array['In-App'::text], 'Medium', 'firm_connection', p_connection_id
    );
  end if;

  return v_row;
end;
$function$;

create or replace function public.assign_firm_package(p_connection_id uuid, p_package_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_parent_workspace_id uuid;
  v_pkg record;
begin
  select parent_workspace_id into v_parent_workspace_id from public.firm_connections where id = p_connection_id;
  if v_parent_workspace_id is null then
    raise exception 'connection not found';
  end if;
  if not (public.is_workspace_admin(v_parent_workspace_id) and public.is_workspace_operational(v_parent_workspace_id)) then
    raise exception 'insufficient permissions';
  end if;

  if p_package_id is null then
    update public.firm_connections set package_id = null where id = p_connection_id;
    return;
  end if;

  select * into v_pkg from public.firm_packages where id = p_package_id and workspace_id = v_parent_workspace_id;
  if v_pkg.id is null then
    raise exception 'package not found';
  end if;

  update public.firm_connections
  set package_id = v_pkg.id,
      revenue_share_percent = v_pkg.revenue_share_percent,
      revenue_share_scope = v_pkg.revenue_share_scope
  where id = p_connection_id;
end;
$function$;
