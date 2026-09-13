-- Phase 5B: read-only network aggregation layer for the future ERO/SB
-- Network Command Center. Every function here is additive -- none of them
-- modify get_firm_production, generate_firm_payout, firm_payouts, or any
-- other existing table/function. All are STABLE, SECURITY DEFINER, gated
-- on is_workspace_admin(p_workspace_id) (the same boundary
-- generate_firm_payout/get_ero_connected_partners already use), and
-- computed set-based in SQL -- no N+1 loop over connections.
--
-- Network Production formula (approved in the Phase 5B Production
-- Definition Audit): the exact same math get_firm_production/
-- generate_firm_payout already use (gross_prep_fees + net_rebates),
-- applied live across every eligible active connection, rather than read
-- from stored firm_payouts rows. The one deliberate, approved divergence
-- from the legacy per-connection function: bank-product transactions with
-- status = 'rejected' are excluded here (get_firm_production has no
-- status filter at all and is NOT being changed to add one).

-- Shared building block: which firm_connections.relationship_type values
-- are "this workspace's own network" -- mirrors
-- lib/firmConnections.ts's CHILD_RELATIONSHIP_TYPES_BY_WORKSPACE_TYPE
-- exactly, so a Service Bureau's service_bureau_ero/service_bureau_ptin
-- connections are never silently dropped the way the Tax Office network
-- rollups (get_ero_return_status et al.) already do by hardcoding
-- 'ero_ptin' -- that bug is documented, not fixed, in the Phase 5B audit;
-- this helper is how the new aggregates avoid repeating it.
create or replace function public.network_child_relationship_types(p_workspace_id uuid)
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select case (select w.workspace_type from public.workspaces w where w.id = p_workspace_id)
    when 'ero_office' then array['ero_ptin']
    when 'service_bureau' then array['service_bureau_ero', 'service_bureau_ptin']
    when 'multi_office_firm' then array['ero_ptin']
    else array[]::text[]
  end;
$$;

-- 5B-1: Network Production -- live, on demand, never read from firm_payouts.
create or replace function public.get_network_production(
  p_workspace_id uuid,
  p_period_start date default null,
  p_period_end date default null
)
returns table(
  period_start date,
  period_end date,
  connection_count integer,
  gross_prep_fees numeric,
  gross_bank_product_rebates numeric,
  gross_bank_fees numeric,
  gross_addon_fees numeric,
  gross_transmission_fees numeric,
  gross_paperwork_fees numeric,
  net_rebates numeric,
  network_production numeric
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions';
  end if;

  -- Same default/period convention as get_firm_production: current
  -- calendar month to date unless an explicit range is given, with the
  -- end date made exclusive one day forward so the whole end date counts.
  v_start := coalesce(p_period_start, date_trunc('month', now())::date);
  v_end := coalesce(p_period_end, now()::date) + interval '1 day';

  return query
    with eligible as (
      select fc.id as connection_id, fc.child_workspace_id
      from public.firm_connections fc
      where fc.parent_workspace_id = p_workspace_id
        and fc.status = 'active'
        and fc.relationship_type = any(public.network_child_relationship_types(p_workspace_id))
        and fc.child_workspace_id is not null
    ),
    prep as (
      select coalesce(sum(i.amount_paid), 0) as gross_prep_fees
      from public.invoices i
      join eligible ec on ec.child_workspace_id = i.workspace_id
      where i.status = 'paid' and i.created_at >= v_start and i.created_at < v_end
    ),
    bank as (
      select
        coalesce(sum(bt.rebate_amount), 0) as gross_bank_product_rebates,
        coalesce(sum(bt.bank_fee), 0) as gross_bank_fees,
        coalesce(sum(bt.addon_fee), 0) as gross_addon_fees,
        coalesce(sum(bt.transmission_fee), 0) as gross_transmission_fees,
        coalesce(sum(bt.paperwork_fee), 0) as gross_paperwork_fees
      from public.bank_product_transactions bt
      join eligible ec on ec.child_workspace_id = bt.workspace_id
      where bt.status <> 'rejected' and bt.created_at >= v_start and bt.created_at < v_end
    )
    select
      v_start::date,
      (v_end - interval '1 day')::date,
      (select count(*)::integer from eligible),
      prep.gross_prep_fees,
      bank.gross_bank_product_rebates,
      bank.gross_bank_fees,
      bank.gross_addon_fees,
      bank.gross_transmission_fees,
      bank.gross_paperwork_fees,
      greatest(bank.gross_bank_product_rebates - bank.gross_bank_fees - bank.gross_addon_fees - bank.gross_transmission_fees - bank.gross_paperwork_fees, 0),
      prep.gross_prep_fees + greatest(bank.gross_bank_product_rebates - bank.gross_bank_fees - bank.gross_addon_fees - bank.gross_transmission_fees - bank.gross_paperwork_fees, 0)
    from prep, bank;
end;
$$;

-- 5B-2: Network Revenue Share -- sums each connection's OWN calculated
-- share (its own percent/scope), never total_production * one flat %.
create or replace function public.get_network_revenue_share(
  p_workspace_id uuid,
  p_period_start date default null,
  p_period_end date default null
)
returns table(
  period_start date,
  period_end date,
  connection_count integer,
  network_production_basis numeric,
  network_revenue_share numeric
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions';
  end if;

  v_start := coalesce(p_period_start, date_trunc('month', now())::date);
  v_end := coalesce(p_period_end, now()::date) + interval '1 day';

  return query
    with eligible as (
      select fc.id as connection_id, fc.child_workspace_id,
             fc.revenue_share_percent, fc.revenue_share_scope
      from public.firm_connections fc
      where fc.parent_workspace_id = p_workspace_id
        and fc.status = 'active'
        and fc.relationship_type = any(public.network_child_relationship_types(p_workspace_id))
        and fc.child_workspace_id is not null
    ),
    per_conn_prep as (
      select ec.connection_id, coalesce(sum(i.amount_paid), 0) as prep_fees
      from eligible ec
      left join public.invoices i
        on i.workspace_id = ec.child_workspace_id and i.status = 'paid'
        and i.created_at >= v_start and i.created_at < v_end
      group by ec.connection_id
    ),
    per_conn_bank as (
      select ec.connection_id,
        greatest(
          coalesce(sum(bt.rebate_amount), 0) - coalesce(sum(bt.bank_fee), 0)
          - coalesce(sum(bt.addon_fee), 0) - coalesce(sum(bt.transmission_fee), 0)
          - coalesce(sum(bt.paperwork_fee), 0), 0
        ) as net_rebates
      from eligible ec
      left join public.bank_product_transactions bt
        on bt.workspace_id = ec.child_workspace_id and bt.status <> 'rejected'
        and bt.created_at >= v_start and bt.created_at < v_end
      group by ec.connection_id
    ),
    per_conn_share as (
      select
        ec.connection_id,
        p.prep_fees,
        b.net_rebates,
        case coalesce(ec.revenue_share_scope, 'all_production')
          when 'bank_products_only' then b.net_rebates * (coalesce(ec.revenue_share_percent, 0) / 100.0)
          when 'prep_fees_only' then p.prep_fees * (coalesce(ec.revenue_share_percent, 0) / 100.0)
          else (p.prep_fees + b.net_rebates) * (coalesce(ec.revenue_share_percent, 0) / 100.0)
        end as ero_share
      from eligible ec
      join per_conn_prep p on p.connection_id = ec.connection_id
      join per_conn_bank b on b.connection_id = ec.connection_id
    )
    select
      v_start::date,
      (v_end - interval '1 day')::date,
      (select count(*)::integer from eligible),
      coalesce(sum(per_conn_share.prep_fees + per_conn_share.net_rebates), 0),
      coalesce(sum(per_conn_share.ero_share), 0)
    from per_conn_share;
end;
$$;

-- 5B-3: Payout summary -- reads existing firm_payouts as-is, no writes,
-- no regeneration, no status changes. A separate metric family from the
-- live production/revenue-share aggregates above.
create or replace function public.get_network_payout_summary(p_workspace_id uuid)
returns table(
  pending_count integer,
  pending_amount numeric,
  paid_count integer,
  paid_amount numeric,
  disputed_count integer,
  disputed_amount numeric
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions';
  end if;

  return query
    select
      count(*) filter (where status = 'pending')::integer,
      coalesce(sum(amount_owed_to_ptin) filter (where status = 'pending'), 0),
      count(*) filter (where status = 'paid')::integer,
      coalesce(sum(amount_owed_to_ptin) filter (where status = 'paid'), 0),
      count(*) filter (where status = 'disputed')::integer,
      coalesce(sum(amount_owed_to_ptin) filter (where status = 'disputed'), 0)
    from public.firm_payouts
    where parent_workspace_id = p_workspace_id;
end;
$$;

-- 5B-4: Partner production ranking -- one row per eligible active
-- connection. Deliberately does NOT reuse get_ero_return_status/
-- get_ero_tax_year_metrics (both hardcode relationship_type = 'ero_ptin',
-- which silently excludes a Service Bureau's own network -- documented,
-- not fixed, in the Phase 5B audit). return_volume is a simple all-time
-- count of engagement_tax_details rows per connection's child workspace,
-- matching the existing tax/return data model without inventing new
-- period semantics for it -- tax-year metrics remain a separate family
-- from this calendar-period production figure.
create or replace function public.get_network_partner_production(
  p_workspace_id uuid,
  p_period_start date default null,
  p_period_end date default null,
  p_sort_by text default 'production'
)
returns table(
  connection_id uuid,
  child_workspace_id uuid,
  partner_name text,
  relationship_type text,
  production numeric,
  return_volume bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions';
  end if;
  if p_sort_by not in ('production', 'return_volume') then
    raise exception 'invalid sort field: %', p_sort_by;
  end if;

  v_start := coalesce(p_period_start, date_trunc('month', now())::date);
  v_end := coalesce(p_period_end, now()::date) + interval '1 day';

  return query
    with eligible as (
      select fc.id as connection_id, fc.child_workspace_id, fc.relationship_type,
             coalesce(cw.name, fc.manual_name, 'Connected firm') as partner_name
      from public.firm_connections fc
      left join public.workspaces cw on cw.id = fc.child_workspace_id
      where fc.parent_workspace_id = p_workspace_id
        and fc.status = 'active'
        and fc.relationship_type = any(public.network_child_relationship_types(p_workspace_id))
        and fc.child_workspace_id is not null
    ),
    prep as (
      select ec.connection_id, coalesce(sum(i.amount_paid), 0) as prep_fees
      from eligible ec
      left join public.invoices i
        on i.workspace_id = ec.child_workspace_id and i.status = 'paid'
        and i.created_at >= v_start and i.created_at < v_end
      group by ec.connection_id
    ),
    bank as (
      select ec.connection_id,
        greatest(
          coalesce(sum(bt.rebate_amount), 0) - coalesce(sum(bt.bank_fee), 0)
          - coalesce(sum(bt.addon_fee), 0) - coalesce(sum(bt.transmission_fee), 0)
          - coalesce(sum(bt.paperwork_fee), 0), 0
        ) as net_rebates
      from eligible ec
      left join public.bank_product_transactions bt
        on bt.workspace_id = ec.child_workspace_id and bt.status <> 'rejected'
        and bt.created_at >= v_start and bt.created_at < v_end
      group by ec.connection_id
    ),
    returns as (
      select ec.connection_id, count(etd.*) as return_volume
      from eligible ec
      left join public.engagement_tax_details etd on etd.workspace_id = ec.child_workspace_id
      group by ec.connection_id
    )
    select
      ec.connection_id, ec.child_workspace_id, ec.partner_name, ec.relationship_type,
      prep.prep_fees + bank.net_rebates,
      returns.return_volume
    from eligible ec
    join prep on prep.connection_id = ec.connection_id
    join bank on bank.connection_id = ec.connection_id
    join returns on returns.connection_id = ec.connection_id
    order by
      case when p_sort_by = 'production' then prep.prep_fees + bank.net_rebates end desc nulls last,
      case when p_sort_by = 'return_volume' then returns.return_volume end desc nulls last;
end;
$$;

-- 5B-5: Onboarding stage breakdown + a 14-day-inactivity approximation
-- using firm_connections.updated_at, the only activity-adjacent timestamp
-- that exists -- there is no dedicated stage-transition log. Per the
-- approved product decision, this must be surfaced as "no activity in 14
-- days," never as "stalled at this stage for 14 days."
create or replace function public.get_network_onboarding_summary(p_workspace_id uuid)
returns table(
  invited_count integer,
  agreement_signed_count integer,
  software_provisioned_count integer,
  live_count integer,
  no_activity_14d_count integer
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions';
  end if;

  return query
    select
      count(*) filter (where onboarding_stage = 'invited')::integer,
      count(*) filter (where onboarding_stage = 'agreement_signed')::integer,
      count(*) filter (where onboarding_stage = 'software_provisioned')::integer,
      count(*) filter (where onboarding_stage = 'live')::integer,
      count(*) filter (where updated_at < now() - interval '14 days')::integer
    from public.firm_connections
    where parent_workspace_id = p_workspace_id
      and status = 'active'
      and relationship_type = any(public.network_child_relationship_types(p_workspace_id));
end;
$$;

-- 5B-6: Network review status summary -- reads engagement_shares exactly
-- as Review Queue already scopes it (shared_with_workspace_id), no change
-- to the sharing model, review permissions, or approval behavior.
create or replace function public.get_network_review_status_summary(p_workspace_id uuid)
returns table(
  awaiting_review_count integer,
  corrections_requested_count integer,
  approved_count integer,
  rejected_count integer
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions';
  end if;

  return query
    select
      count(*) filter (where status = 'pending')::integer,
      count(*) filter (where status = 'corrections_requested')::integer,
      count(*) filter (where status = 'approved')::integer,
      count(*) filter (where status = 'rejected')::integer
    from public.engagement_shares
    where shared_with_workspace_id = p_workspace_id;
end;
$$;

-- 5B-7: Bank/software assignment distribution across the active network.
-- Read-only against the existing bank_partners/software_partners catalog
-- and firm_connections' own assignment columns -- no catalog/assignment
-- model change.
create or replace function public.get_network_bank_software_distribution(p_workspace_id uuid)
returns table(
  distribution_type text,
  partner_id uuid,
  partner_name text,
  connection_count integer
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions';
  end if;

  return query
    select 'bank'::text, bp.id, bp.name, count(fc.*)::integer
    from public.firm_connections fc
    join public.bank_partners bp on bp.id = fc.bank_partner_id
    where fc.parent_workspace_id = p_workspace_id
      and fc.status = 'active'
      and fc.relationship_type = any(public.network_child_relationship_types(p_workspace_id))
    group by bp.id, bp.name
    union all
    select 'software'::text, sp.id, sp.name, count(fc.*)::integer
    from public.firm_connections fc
    join public.software_partners sp on sp.id = fc.software_partner_id
    where fc.parent_workspace_id = p_workspace_id
      and fc.status = 'active'
      and fc.relationship_type = any(public.network_child_relationship_types(p_workspace_id))
    group by sp.id, sp.name;
end;
$$;

-- 5B-8: Package revenue -- kept entirely separate from production/
-- revenue-share/partner-production, per the approved definition.
-- Deliberately has NO period parameter: firm_package_purchases has no
-- discrete per-cycle billing-event ledger, only purchased_at (a one-time
-- sale date), current_period_end/canceled_at (subscription lifecycle
-- markers), and a single "amount" per purchase row (its price per billing
-- cycle, not a running total). There is no record of individual
-- renewal/invoice events to attribute revenue to an arbitrary calendar
-- period, so rather than inventing that behavior, this reports the
-- current active-subscription run rate only.
create or replace function public.get_network_package_revenue(p_workspace_id uuid)
returns table(
  active_purchase_count integer,
  active_package_revenue numeric
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions';
  end if;

  return query
    select count(*)::integer, coalesce(sum(amount), 0)
    from public.firm_package_purchases
    where parent_workspace_id = p_workspace_id
      and status = 'active';
end;
$$;
