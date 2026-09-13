-- An ERO splits fees with its own connected PTINs the same way a Service
-- Bureau splits with its EROs, but an ERO never sells a "package" -- so the
-- split percentage can't keep living solely on firm_packages (which is now
-- Service-Bureau-only, see 20260927000000). Moves the percentage/scope onto
-- firm_connections itself as the new source of truth for generate_firm_payout,
-- with package assignment (Service Bureau only) simply copying its values
-- onto the connection as a one-time convenience, not a live binding -- a
-- package edited later does not retroactively change already-assigned
-- connections.

alter table public.firm_connections
  add column revenue_share_percent numeric check (revenue_share_percent is null or (revenue_share_percent between 0 and 100)),
  add column revenue_share_scope text check (revenue_share_scope in ('all_production', 'bank_products_only', 'prep_fees_only'));

-- Backfill from any currently-assigned package so this ships with zero
-- change in behavior for existing customers -- skipping this would silently
-- zero out every connection's split the moment generate_firm_payout stops
-- reading firm_packages.
update public.firm_connections fc
set revenue_share_percent = fp.revenue_share_percent,
    revenue_share_scope = fp.revenue_share_scope
from public.firm_packages fp
where fc.package_id = fp.id and fc.revenue_share_percent is null;

create or replace function public.generate_firm_payout(
  p_connection_id uuid,
  p_period_start date,
  p_period_end date
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_conn record;
  v_production jsonb;
  v_prep_fees numeric;
  v_rebates numeric;
  v_bank_fees numeric;
  v_addon_fees numeric;
  v_transmission_fees numeric;
  v_paperwork_fees numeric;
  v_net_rebates numeric;
  v_share_pct numeric;
  v_scope text;
  v_ero_share numeric;
  v_owed numeric;
  v_payout_id uuid;
begin
  select * into v_conn from public.firm_connections where id = p_connection_id;
  if v_conn.id is null then
    raise exception 'connection not found';
  end if;
  if not public.is_workspace_admin(v_conn.parent_workspace_id) then
    raise exception 'insufficient permissions';
  end if;

  v_production := public.get_firm_production(p_connection_id, p_period_start, p_period_end);
  v_prep_fees := coalesce((v_production ->> 'gross_prep_fees')::numeric, 0);
  v_rebates := coalesce((v_production ->> 'gross_bank_product_rebates')::numeric, 0);
  v_bank_fees := coalesce((v_production ->> 'gross_bank_fees')::numeric, 0);
  v_addon_fees := coalesce((v_production ->> 'gross_addon_fees')::numeric, 0);
  v_transmission_fees := coalesce((v_production ->> 'gross_transmission_fees')::numeric, 0);
  v_paperwork_fees := coalesce((v_production ->> 'gross_paperwork_fees')::numeric, 0);

  v_net_rebates := greatest(v_rebates - v_bank_fees - v_addon_fees - v_transmission_fees - v_paperwork_fees, 0);

  v_share_pct := coalesce(v_conn.revenue_share_percent, 0);
  v_scope := coalesce(v_conn.revenue_share_scope, 'all_production');

  v_ero_share := case v_scope
    when 'bank_products_only' then v_net_rebates * (v_share_pct / 100.0)
    when 'prep_fees_only' then v_prep_fees * (v_share_pct / 100.0)
    else (v_prep_fees + v_net_rebates) * (v_share_pct / 100.0)
  end;

  v_owed := (v_prep_fees + v_net_rebates) - v_ero_share;

  insert into public.firm_payouts (
    connection_id, parent_workspace_id, child_workspace_id, period_start, period_end,
    gross_prep_fees, gross_bank_product_rebates, gross_bank_fees, gross_addon_fees,
    gross_transmission_fees, gross_paperwork_fees, ero_share_amount, amount_owed_to_ptin
  )
  values (
    p_connection_id, v_conn.parent_workspace_id, v_conn.child_workspace_id, p_period_start, p_period_end,
    v_prep_fees, v_rebates, v_bank_fees, v_addon_fees, v_transmission_fees, v_paperwork_fees, v_ero_share, v_owed
  )
  on conflict (connection_id, period_start, period_end) do update set
    gross_prep_fees = excluded.gross_prep_fees,
    gross_bank_product_rebates = excluded.gross_bank_product_rebates,
    gross_bank_fees = excluded.gross_bank_fees,
    gross_addon_fees = excluded.gross_addon_fees,
    gross_transmission_fees = excluded.gross_transmission_fees,
    gross_paperwork_fees = excluded.gross_paperwork_fees,
    ero_share_amount = excluded.ero_share_amount,
    amount_owed_to_ptin = excluded.amount_owed_to_ptin,
    updated_at = now()
  where public.firm_payouts.status = 'pending'
  returning id into v_payout_id;

  if v_payout_id is null then
    select id into v_payout_id from public.firm_payouts
    where connection_id = p_connection_id and period_start = p_period_start and period_end = p_period_end;
  end if;

  return v_payout_id;
end;
$function$;

-- Assigning a package (Service Bureau only, enforced by is_service_bureau_workspace
-- on firm_packages itself -- if p_package_id doesn't belong to a Service
-- Bureau package the select below simply finds nothing to copy) copies its
-- percentage/scope onto the connection in the same statement as setting
-- package_id, so PackagePicker no longer needs a client-side read-then-write.
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

revoke all on function public.assign_firm_package(uuid, uuid) from public;
grant execute on function public.assign_firm_package(uuid, uuid) to authenticated, service_role;

-- get_ero_connected_partners's return shape changes (two new columns), so
-- this needs drop-then-create rather than CREATE OR REPLACE, same as the
-- prior return-shape change in 20260926030000.
drop function if exists public.get_ero_connected_partners(uuid, text[]);

create function public.get_ero_connected_partners(p_workspace_id uuid, p_relationship_types text[] default array['ero_ptin'::text])
returns table(
  connection_id uuid, child_workspace_id uuid, name text, owner_name text, relationship_type text, status text,
  phone text, primary_contact_email text, website text, mailing_address text,
  billing_responsibility text, shares_communications_identity boolean, allows_branding_override boolean,
  default_reviewer_id uuid, restrict_ptin_staff_assignment boolean, allows_learning_hub_downline_share boolean, package_id uuid,
  bank_partner_id uuid, bank_partner_name text, software_partner_id uuid, software_partner_name text,
  partner_software_used text[], partner_tax_programs text[], notes text, created_at timestamptz, responded_at timestamptz,
  efin_last4 text, ptin_last4 text, onboarding_stage text, preparer_credential text,
  filed_under_connection_id uuid, filed_under_name text, downstream_ptin_count int,
  revenue_share_percent numeric, revenue_share_scope text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'Only a workspace admin can view connected partners';
  end if;

  return query
    select
      fc.id, fc.child_workspace_id, coalesce(cw.name, 'Pending invite'), cw.owner_name, fc.relationship_type, fc.status,
      cw.phone, cw.primary_contact_email::text, cw.website, cw.mailing_address,
      fc.billing_responsibility, fc.shares_communications_identity, fc.allows_branding_override,
      fc.default_reviewer_id, fc.restrict_ptin_staff_assignment, fc.allows_learning_hub_downline_share, fc.package_id,
      fc.bank_partner_id, bp.name, fc.software_partner_id, sp.name,
      fc.partner_software_used, fc.partner_tax_programs, fc.notes, fc.created_at, fc.responded_at,
      ftp.efin_last4, ftp.ptin_last4, fc.onboarding_stage, fc.preparer_credential,
      fc.filed_under_connection_id, fuw.name,
      (select count(*)::int from public.firm_connections dc where dc.parent_workspace_id = fc.child_workspace_id and dc.relationship_type = 'ero_ptin'),
      fc.revenue_share_percent, fc.revenue_share_scope
    from public.firm_connections fc
    left join public.workspaces cw on cw.id = fc.child_workspace_id
    left join public.bank_partners bp on bp.id = fc.bank_partner_id
    left join public.software_partners sp on sp.id = fc.software_partner_id
    left join public.firm_tax_profile ftp on ftp.workspace_id = fc.child_workspace_id
    left join public.firm_connections fu on fu.id = fc.filed_under_connection_id
    left join public.workspaces fuw on fuw.id = fu.child_workspace_id
    where fc.parent_workspace_id = p_workspace_id
      and fc.relationship_type = any(p_relationship_types)
    order by (fc.status = 'active') desc, cw.name nulls last;
end;
$$;

revoke all on function public.get_ero_connected_partners(uuid, text[]) from public;
grant execute on function public.get_ero_connected_partners(uuid, text[]) to authenticated, service_role;
