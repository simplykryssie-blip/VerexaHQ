-- Core Early Access invitation -> account/workspace provisioning RPC, and
-- an Early-Access-scoped checkout session request that grants the plan the
-- invitation specifies (or 'beta'/Founding Beta by default) without the
-- public_plan=true restriction that create_checkout_session_request
-- correctly applies to the general self-serve checkout entry point --
-- Early Access signup is admin-invited, not self-serve, so that gate does
-- not apply here. Neither existing function is modified.

create or replace function public.provision_early_access_workspace(
  p_user_id uuid,
  p_invitation_id uuid,
  p_email text,
  p_full_name text,
  p_business_name text,
  p_business_email text,
  p_business_phone text,
  p_ip_address inet default null,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_inv public.early_access_invitations%rowtype;
  v_campaign public.early_access_campaigns%rowtype;
  v_workspace_id uuid;
  v_existing_member public.workspace_members%rowtype;
  v_clean_email text := lower(trim(coalesce(p_email,'')));
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_user_id is null then raise exception 'User ID is required'; end if;
  if p_invitation_id is null then raise exception 'Invitation ID is required'; end if;

  -- Idempotency: if this user already has an active membership (a retried
  -- call after a partial earlier success), return that workspace rather
  -- than creating a duplicate.
  select * into v_existing_member
  from public.workspace_members
  where user_id = p_user_id and member_status = 'Active'
  order by created_at limit 1;
  if v_existing_member.workspace_id is not null then
    return v_existing_member.workspace_id;
  end if;

  select * into v_inv from public.early_access_invitations where id = p_invitation_id for update;
  if v_inv.id is null then raise exception 'Early Access invitation not found'; end if;
  if lower(v_inv.email) <> v_clean_email then raise exception 'Invitation email does not match the account email'; end if;

  if v_inv.status = 'accepted' then
    if v_inv.workspace_id is not null and exists (
      select 1 from public.workspaces w where w.id = v_inv.workspace_id and w.owner_id = p_user_id
    ) then
      return v_inv.workspace_id;
    end if;
    raise exception 'This invitation has already been accepted';
  end if;
  if v_inv.status = 'revoked' then raise exception 'This invitation has been revoked'; end if;
  if v_inv.expires_at <= now() then
    update public.early_access_invitations set status = 'expired', updated_at = now() where id = v_inv.id;
    raise exception 'This invitation has expired';
  end if;

  select * into v_campaign from public.early_access_campaigns where id = v_inv.campaign_id;
  if v_campaign.id is null then raise exception 'Early Access campaign not found'; end if;

  insert into public.profiles(id, email, full_name, onboarding_completed)
  values (p_user_id, nullif(v_clean_email,''), nullif(trim(coalesce(p_full_name,'')),''), false)
  on conflict (id) do update set
    email = coalesce(excluded.email, public.profiles.email),
    full_name = coalesce(excluded.full_name, public.profiles.full_name);

  insert into public.workspaces(owner_id, business_name, business_email, business_phone)
  values (
    p_user_id,
    coalesce(nullif(trim(coalesce(p_business_name,'')),''), 'My VerexaHQ Workspace'),
    nullif(trim(coalesce(p_business_email,'')),''),
    nullif(trim(coalesce(p_business_phone,'')),'')
  )
  returning id into v_workspace_id;

  insert into public.workspace_members(workspace_id, user_id, role, member_status, joined_at)
  values (v_workspace_id, p_user_id, 'Owner', 'Active', now());

  insert into public.early_access_agreements(
    campaign_id, workspace_id, user_id, invitation_id, agreement_version, agreement_snapshot,
    ip_address, user_agent
  ) values (
    v_campaign.id, v_workspace_id, p_user_id, v_inv.id,
    coalesce(v_campaign.agreement_version, 'v1'), coalesce(v_campaign.agreement_content, ''),
    p_ip_address, p_user_agent
  );

  update public.early_access_invitations
  set status = 'accepted', workspace_id = v_workspace_id, accepted_by = p_user_id,
      accepted_at = now(), opened_at = coalesce(opened_at, now()), updated_at = now()
  where id = v_inv.id;

  return v_workspace_id;
end;
$$;

revoke execute on function public.provision_early_access_workspace(uuid, uuid, text, text, text, text, text, inet, text) from anon, authenticated;
grant execute on function public.provision_early_access_workspace(uuid, uuid, text, text, text, text, text, inet, text) to service_role;

create or replace function public.create_early_access_checkout_session_request(
  p_workspace_id uuid,
  p_invitation_id uuid,
  p_success_url text,
  p_cancel_url text,
  p_customer_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_inv public.early_access_invitations%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_plan_code text;
  v_price_id text;
  v_email text;
  v_existing public.workspace_checkout_sessions%rowtype;
  v_session_id uuid;
begin
  if auth.role() <> 'service_role' and not public.workspace_owner_can_manage_billing(p_workspace_id) then
    raise exception 'Only the workspace owner or platform billing admin may create checkout requests';
  end if;
  if not public.checkout_redirect_url_is_allowed(p_success_url) or not public.checkout_redirect_url_is_allowed(p_cancel_url) then
    raise exception 'Invalid checkout redirect URL';
  end if;

  select * into v_inv from public.early_access_invitations where id = p_invitation_id;
  if v_inv.id is null then raise exception 'Early Access invitation not found'; end if;
  if v_inv.workspace_id is distinct from p_workspace_id then raise exception 'Invitation does not belong to this workspace'; end if;

  v_plan_code := coalesce(nullif(trim(coalesce(v_inv.plan_code,'')),''), 'beta');
  select * into v_plan from public.subscription_plans where plan_code = v_plan_code and is_active = true;
  if v_plan.id is null then
    return jsonb_build_object('ok', false, 'error', 'Subscription plan is not configured.', 'plan_code', v_plan_code);
  end if;

  v_price_id := v_plan.provider_monthly_price_id;
  if coalesce(v_price_id,'') = '' then
    return jsonb_build_object('ok', false, 'error', 'Stripe price ID is missing for this plan.', 'plan_code', v_plan_code);
  end if;

  v_email := lower(nullif(trim(coalesce(p_customer_email,'')),''));

  select * into v_existing
  from public.workspace_checkout_sessions
  where workspace_id = p_workspace_id
    and plan_code = v_plan_code
    and checkout_status in ('ready_for_edge_function','created')
    and expires_at > now()
  order by created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true, 'checkout_request_id', v_existing.id, 'checkout_status', v_existing.checkout_status,
      'reused_existing', true
    );
  end if;

  insert into public.workspace_checkout_sessions(
    workspace_id, plan_id, plan_code, billing_cycle, stripe_price_id, checkout_status,
    success_url, cancel_url, customer_email, requested_by, metadata, expires_at
  ) values (
    p_workspace_id, v_plan.id, v_plan_code, 'Monthly', v_price_id, 'ready_for_edge_function',
    trim(p_success_url), trim(p_cancel_url), v_email, auth.uid(),
    jsonb_build_object('brand_name','Verexa HQ','requires_edge_function',true,'authorization','early_access_invitation','invitation_id',p_invitation_id),
    now() + interval '24 hours'
  ) returning id into v_session_id;

  return jsonb_build_object('ok', true, 'checkout_request_id', v_session_id, 'checkout_status', 'ready_for_edge_function', 'reused_existing', false, 'plan_id', v_plan.id, 'stripe_price_id', v_price_id);
end;
$$;

revoke execute on function public.create_early_access_checkout_session_request(uuid, uuid, text, text, text) from anon;
grant execute on function public.create_early_access_checkout_session_request(uuid, uuid, text, text, text) to authenticated, service_role;
