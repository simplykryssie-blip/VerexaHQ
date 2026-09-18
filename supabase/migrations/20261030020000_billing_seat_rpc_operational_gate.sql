-- Suspension/Archive lifecycle hardening, item 2 (billing/seat RPC closure
-- pass). Each function below is a SECURITY DEFINER RPC that mutates
-- billing-adjacent state (seat purchase/removal, package assignment,
-- firm-connection billing responsibility, connection disconnect, releasing
-- a sponsored staff member) with no lifecycle check at all today. Each is
-- reproduced in full with exactly one addition: an is_workspace_operational()
-- check alongside the existing admin/permission check, never replacing it.
--
-- Deliberately NOT touched here (reasoned exclusions, not oversights):
--   - upsert_workspace_subscription: platform-admin-only (is_platform_admin()
--     is its sole gate), and is_workspace_operational() already ORs in
--     is_platform_admin() -- adding it would be a no-op for the only caller
--     who can ever reach this function, and platform admins specifically
--     need to be able to assign/fix a subscription on a suspended/archived
--     workspace as part of resolving it.
--   - start_personal_billing_setup: operates on the RELEASED staff member's
--     own personal workspace (finding or creating it), never the sponsor
--     workspace that released them -- this is explicitly the released-staff
--     "Set Up My Billing" recovery flow that lib/workspace.ts's
--     isSuspensionRecoveryPath allow-list exists to keep reachable; it has
--     no sponsor-workspace operational status to check against.

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
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
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
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
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
  if not public.is_workspace_admin(v_parent_workspace_id) then
    raise exception 'insufficient permissions';
  end if;
  if not public.is_workspace_operational(v_parent_workspace_id) then
    raise exception 'this workspace is not currently operational';
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

CREATE OR REPLACE FUNCTION public.accept_firm_connection_billing(p_connection_id uuid)
 RETURNS firm_connections
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.firm_connections;
begin
  select * into v_row from public.firm_connections where id = p_connection_id for update;
  if v_row.id is null then
    raise exception 'connection not found';
  end if;
  if not public.is_workspace_admin(v_row.parent_workspace_id) then
    raise exception 'Only the ERO can accept billing for this connection.';
  end if;
  if not public.is_workspace_operational(v_row.parent_workspace_id) then
    raise exception 'this workspace is not currently operational';
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
$function$
;

CREATE OR REPLACE FUNCTION public.release_firm_connection_billing(p_connection_id uuid)
 RETURNS firm_connections
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.firm_connections;
begin
  select * into v_row from public.firm_connections where id = p_connection_id for update;
  if v_row.id is null then
    raise exception 'connection not found';
  end if;
  if not public.is_workspace_admin(v_row.parent_workspace_id) then
    raise exception 'Only the ERO can release billing for this connection.';
  end if;
  if not public.is_workspace_operational(v_row.parent_workspace_id) then
    raise exception 'this workspace is not currently operational';
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
$function$
;

CREATE OR REPLACE FUNCTION public.disconnect_firm_connection(p_connection_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row public.firm_connections;
  v_is_ero_admin boolean;
  v_is_ptin_admin boolean;
begin
  select * into v_row from public.firm_connections where id = p_connection_id for update;
  if v_row.id is null then
    raise exception 'connection not found';
  end if;

  v_is_ero_admin := public.is_workspace_admin(v_row.parent_workspace_id);
  v_is_ptin_admin := public.is_workspace_admin(v_row.child_workspace_id) and v_row.billing_responsibility <> 'ero';

  if not (v_is_ero_admin or v_is_ptin_admin) then
    raise exception 'Only the ERO, or an independently-billed PTIN, can disconnect this connection.';
  end if;

  -- Operational check applies to whichever side is initiating the
  -- disconnect -- an ERO admin acting on a suspended/archived parent
  -- workspace, or a self-billed PTIN admin acting on a suspended/archived
  -- child workspace, is blocked the same way any other operational
  -- mutation on that workspace would be.
  if v_is_ero_admin and not public.is_workspace_operational(v_row.parent_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if v_is_ptin_admin and not v_is_ero_admin and not public.is_workspace_operational(v_row.child_workspace_id) then
    raise exception 'this workspace is not currently operational';
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
$function$
;

create or replace function public.release_sponsored_staff_member(p_workspace_id uuid, p_user_id uuid)
returns public.sponsorship_transitions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period_end timestamptz;
  v_plan_id uuid;
  v_plan_name text;
  v_plan_price_cents integer;
  v_sponsor_name text;
  v_recipient_email text;
  v_member record;
  v_transition public.sponsorship_transitions;
  v_inserted boolean := false;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to release members from this workspace';
  end if;
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  select * into v_member from public.workspace_users where workspace_id = p_workspace_id and user_id = p_user_id and status = 'active';
  if v_member.user_id is null then
    raise exception 'this person is not an active member of this workspace';
  end if;
  if v_member.is_owner then
    raise exception 'the workspace owner cannot be released';
  end if;

  select current_period_end, w.name into v_period_end, v_sponsor_name
  from public.workspace_subscriptions ws join public.workspaces w on w.id = ws.workspace_id
  where ws.workspace_id = p_workspace_id;
  if v_period_end is null then
    raise exception 'this workspace has no active billing period to base a sponsorship transition on';
  end if;

  select id, name, base_price_cents into v_plan_id, v_plan_name, v_plan_price_cents
  from public.platform_subscription_plans where slug = 'solo' and is_active limit 1;
  if v_plan_id is null then
    raise exception 'the solo plan is not configured';
  end if;

  insert into public.sponsorship_transitions (sponsor_workspace_id, user_id, released_by, sponsorship_end_date, plan_id)
  values (p_workspace_id, p_user_id, auth.uid(), v_period_end, v_plan_id)
  on conflict (user_id) where status = 'billing_setup_required' do nothing
  returning * into v_transition;

  if v_transition.id is not null then
    v_inserted := true;
  else
    select * into v_transition from public.sponsorship_transitions where user_id = p_user_id and status = 'billing_setup_required';
  end if;

  if v_inserted and v_transition.release_notice_sent_at is null then
    select email into v_recipient_email from auth.users where id = p_user_id;
    if v_recipient_email is not null then
      insert into public.notification_queue (
        workspace_id, channel, channels, template_key, event_type, payload,
        recipient_user_id, recipient_email, dedupe_key
      ) values (
        p_workspace_id, 'Email', array['Email'], 'sponsorship-release-notice', 'sponsorship_release_notice',
        jsonb_build_object(
          'firm_name', v_sponsor_name,
          'sponsorship_end_date', to_char(v_period_end, 'FMMonth FMDD, YYYY'),
          'plan_name', v_plan_name,
          'monthly_price', to_char(v_plan_price_cents / 100.0, 'FM$999,999,990.00')
        ),
        p_user_id, v_recipient_email, 'sponsorship-release-notice:' || v_transition.id
      );
      update public.sponsorship_transitions set release_notice_sent_at = now() where id = v_transition.id;
    end if;
  end if;

  return v_transition;
end;
$$;
