-- ============================================================================
-- MIGRATION RECONCILIATION PHASE 1.9 -- RECOVERED FROM PRODUCTION (PR #268)
--
-- Did not previously exist in Git main. Applied directly to production
-- during the MKB Tax Prep + Client Review + F1/F2/NW-1 security work
-- (PR #268, branch claude/verexa-schema-mismatch-i8c19u, never merged).
-- Reproduced verbatim from schema_migrations.statements (16124 bytes,
-- exact length match). Confidence: A -- exact original recovered.
--
-- Filename uses the real recorded production version (20260914182351),
-- not the branch's local filename (20261018000000_phase4a_billing_
-- suspension_blockers.sql) -- a genuine filename/version drift case. The
-- branch's own file additionally carries a long explanatory prose header
-- not present in what was actually applied (the same drift pattern found
-- and documented in earlier reconciliation phases); this recovery uses the
-- production-recorded SQL as the authoritative source rather than the
-- branch's expanded version, per established phase precedent.
--
-- Current-state verification (2026-09-20, read-only): re-checked
-- create_paid_workspace, set_workspace_status, submit_organizer_response,
-- and all 5 firm-connection functions below directly against production;
-- all still exist and all still carry this migration's behavior
-- (billing_incomplete status / is_workspace_operational checks). None of
-- these functions, nor the 9 RLS policies below (on firm_connections,
-- firm_packages, invoices), are represented in main under any other
-- migration -- confirmed by full git history search on each function name.
-- ============================================================================

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

  insert into public.workspace_subscriptions (workspace_id, plan_id)
  values (v_workspace_id, v_plan_id);

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
