-- P1 Remediation (audit-approved, narrow scope only):
--
-- P1 #1: get_firm_production summed every bank_product_transactions row
-- regardless of status, unlike get_network_production/
-- get_network_partner_production (20260929000000_network_command_center_
-- aggregates.sql), which already exclude status = 'rejected'. This brings
-- get_firm_production in line with that same, already-accepted treatment --
-- not a new financial interpretation. generate_firm_payout and the
-- partner-dashboard/firm-detail "estimate" reads both call
-- get_firm_production directly, so fixing it here fixes both without
-- touching either caller. Historical firm_payouts rows are intentionally
-- left untouched -- that's a separate, deferred decision.
--
-- P1 #2: record_partner_onboarding_review / set_partner_onboarding_training /
-- set_partner_onboarding_bank_software_setup checked only
-- is_workspace_admin(p_workspace_id) and that the onboarding row belongs to
-- that workspace -- never whether the onboarding's own firm_connections row
-- had since been revoked. A revoked partner relationship could still be
-- approved/rejected or have its setup checklist completed. Adds one
-- server-side guard to each of the three functions; the authorization model
-- (is_workspace_admin, workspace-scoped lookup) and every other lifecycle
-- rule are otherwise unchanged.

create or replace function public.get_firm_production(
  p_connection_id uuid,
  p_period_start date default null,
  p_period_end date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conn record;
  v_start timestamptz;
  v_end timestamptz;
  v_result jsonb;
begin
  select * into v_conn from public.firm_connections where id = p_connection_id;
  if v_conn.id is null then
    raise exception 'connection not found';
  end if;
  if not (public.is_workspace_member(v_conn.parent_workspace_id) or public.is_workspace_member(v_conn.child_workspace_id)) then
    raise exception 'insufficient permissions';
  end if;

  v_start := coalesce(p_period_start, date_trunc('month', now())::date);
  v_end := coalesce(p_period_end, now()::date) + interval '1 day';

  select jsonb_build_object(
    'period_start', v_start::date,
    'period_end', (v_end - interval '1 day')::date,
    'active_clients', (
      select count(*) from public.clients
      where workspace_id = v_conn.child_workspace_id and merged_into_client_id is null
    ),
    'engagements_by_status', (
      select coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb)
      from (
        select status, count(*) cnt from public.engagements
        where workspace_id = v_conn.child_workspace_id and created_at >= v_start and created_at < v_end
        group by status
      ) s
    ),
    'returns_completed', (
      select count(*) from public.engagements
      where workspace_id = v_conn.child_workspace_id and status = 'Completed' and updated_at >= v_start and updated_at < v_end
    ),
    'gross_prep_fees', (
      select coalesce(sum(amount_paid), 0) from public.invoices
      where workspace_id = v_conn.child_workspace_id and status = 'paid' and created_at >= v_start and created_at < v_end
    ),
    'bank_products', (
      select coalesce(jsonb_agg(jsonb_build_object('product_type', product_type, 'bank_partner', bank_partner, 'count', cnt, 'total_rebate', total_rebate)), '[]'::jsonb)
      from (
        select product_type, bank_partner, count(*) cnt, coalesce(sum(rebate_amount), 0) total_rebate
        from public.bank_product_transactions
        where workspace_id = v_conn.child_workspace_id and status <> 'rejected' and created_at >= v_start and created_at < v_end
        group by product_type, bank_partner
      ) b
    ),
    'gross_bank_product_rebates', (
      select coalesce(sum(rebate_amount), 0) from public.bank_product_transactions
      where workspace_id = v_conn.child_workspace_id and status <> 'rejected' and created_at >= v_start and created_at < v_end
    ),
    'gross_bank_fees', (
      select coalesce(sum(bank_fee), 0) from public.bank_product_transactions
      where workspace_id = v_conn.child_workspace_id and status <> 'rejected' and created_at >= v_start and created_at < v_end
    ),
    'gross_addon_fees', (
      select coalesce(sum(addon_fee), 0) from public.bank_product_transactions
      where workspace_id = v_conn.child_workspace_id and status <> 'rejected' and created_at >= v_start and created_at < v_end
    ),
    'gross_transmission_fees', (
      select coalesce(sum(transmission_fee), 0) from public.bank_product_transactions
      where workspace_id = v_conn.child_workspace_id and status <> 'rejected' and created_at >= v_start and created_at < v_end
    ),
    'gross_paperwork_fees', (
      select coalesce(sum(paperwork_fee), 0) from public.bank_product_transactions
      where workspace_id = v_conn.child_workspace_id and status <> 'rejected' and created_at >= v_start and created_at < v_end
    )
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.record_partner_onboarding_review(
  p_workspace_id uuid,
  p_onboarding_id uuid,
  p_decision text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_onboarding record;
begin
  if p_decision not in ('approved', 'rejected', 'info_requested') then
    raise exception 'invalid review decision: %', p_decision;
  end if;
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to review onboarding for this workspace';
  end if;

  select * into v_onboarding from public.partner_onboardings where id = p_onboarding_id and workspace_id = p_workspace_id;
  if v_onboarding.id is null then
    raise exception 'onboarding record not found';
  end if;
  if exists (select 1 from public.firm_connections where id = v_onboarding.firm_connection_id and status = 'revoked') then
    raise exception 'cannot review onboarding: firm connection has been revoked';
  end if;
  if v_onboarding.status <> 'under_review' then
    raise exception 'this onboarding is not currently under review';
  end if;

  update public.partner_onboardings
  set review_decision = p_decision,
      review_note = p_note,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      status = case p_decision
        when 'approved' then 'setup'
        when 'rejected' then 'rejected'
        else 'in_progress'
      end,
      rejected_reason = case when p_decision = 'rejected' then p_note else rejected_reason end,
      rejected_at = case when p_decision = 'rejected' then now() else rejected_at end
  where id = p_onboarding_id;

  if p_decision in ('approved', 'rejected') then
    update public.tasks
    set status = 'completed', completed_at = now()
    where firm_connection_id = v_onboarding.firm_connection_id
      and title in ('Review new partner application', 'Approve or reject partner onboarding')
      and status in ('pending', 'in_progress', 'blocked');
  end if;

  perform public._maybe_reach_partner_onboarding_ready(p_onboarding_id);
end;
$$;

create or replace function public.set_partner_onboarding_training(
  p_workspace_id uuid,
  p_onboarding_id uuid,
  p_completed boolean,
  p_learning_course_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connection_id uuid;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to manage this onboarding';
  end if;

  select firm_connection_id into v_connection_id
  from public.partner_onboardings
  where id = p_onboarding_id and workspace_id = p_workspace_id;

  if v_connection_id is null then
    raise exception 'onboarding record not found';
  end if;
  if exists (select 1 from public.firm_connections where id = v_connection_id and status = 'revoked') then
    raise exception 'cannot update onboarding: firm connection has been revoked';
  end if;

  update public.partner_onboardings
  set training_completed_at = case when p_completed then coalesce(training_completed_at, now()) else null end,
      learning_course_id = coalesce(p_learning_course_id, learning_course_id)
  where id = p_onboarding_id;

  perform public._maybe_reach_partner_onboarding_ready(p_onboarding_id);
end;
$$;

create or replace function public.set_partner_onboarding_bank_software_setup(
  p_workspace_id uuid,
  p_onboarding_id uuid,
  p_completed boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connection_id uuid;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to manage this onboarding';
  end if;

  select firm_connection_id into v_connection_id
  from public.partner_onboardings
  where id = p_onboarding_id and workspace_id = p_workspace_id;

  if v_connection_id is null then
    raise exception 'onboarding record not found';
  end if;
  if exists (select 1 from public.firm_connections where id = v_connection_id and status = 'revoked') then
    raise exception 'cannot update onboarding: firm connection has been revoked';
  end if;

  update public.partner_onboardings
  set bank_software_setup_completed_at = case when p_completed then coalesce(bank_software_setup_completed_at, now()) else null end
  where id = p_onboarding_id;

  perform public._maybe_reach_partner_onboarding_ready(p_onboarding_id);
end;
$$;
