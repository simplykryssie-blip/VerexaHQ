-- Phase 5C: two small additive read-only aggregates the Service Bureau
-- Network Command Center needs that Phase 5B's 8 financial/summary
-- aggregates didn't cover. Neither modifies any Phase 5B function, any
-- legacy financial function, or any Tax Office rollup -- both are new,
-- non-financial, SECURITY DEFINER, gated on is_workspace_admin, and reuse
-- network_child_relationship_types() for scope resolution exactly like
-- every Phase 5B aggregate already does.

-- Network Filings This Year -- a return-volume count, deliberately
-- separate from financial production. Does NOT reuse get_ero_tax_year_metrics
-- (it hardcodes relationship_type = 'ero_ptin', which would silently
-- under-count a Service Bureau's service_bureau_ero/service_bureau_ptin
-- connections -- the same documented bug Phase 5B's own partner-production
-- ranking already avoided by not reusing that rollup either).
create or replace function public.get_network_filing_volume(
  p_workspace_id uuid,
  p_tax_year integer default null
)
returns table(
  tax_year integer,
  total_returns bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_tax_year integer;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions';
  end if;

  v_tax_year := coalesce(p_tax_year, extract(year from now())::integer);

  return query
    with eligible as (
      select fc.child_workspace_id
      from public.firm_connections fc
      where fc.parent_workspace_id = p_workspace_id
        and fc.status = 'active'
        and fc.relationship_type = any(public.network_child_relationship_types(p_workspace_id))
        and fc.child_workspace_id is not null
    )
    select v_tax_year, count(*)
    from public.engagement_tax_details etd
    join eligible e on e.child_workspace_id = etd.workspace_id
    where etd.tax_year = v_tax_year;
end;
$$;

revoke all on function public.get_network_filing_volume(uuid, integer) from public;
grant execute on function public.get_network_filing_volume(uuid, integer) to authenticated;

-- Stalled-partner detail rows behind get_network_onboarding_summary's
-- no_activity_14d_count -- that function only returns a count; the Needs
-- Attention / Partner Onboarding sections need to actually name which
-- partners those are. One set-based query, not a per-partner RPC loop.
create or replace function public.get_network_stalled_partners(
  p_workspace_id uuid,
  p_inactivity_days integer default 14
)
returns table(
  connection_id uuid,
  partner_name text,
  relationship_type text,
  onboarding_stage text,
  updated_at timestamptz
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
      fc.id,
      coalesce(cw.name, fc.manual_name, 'Connected firm'),
      fc.relationship_type,
      fc.onboarding_stage,
      fc.updated_at
    from public.firm_connections fc
    left join public.workspaces cw on cw.id = fc.child_workspace_id
    where fc.parent_workspace_id = p_workspace_id
      and fc.status = 'active'
      and fc.relationship_type = any(public.network_child_relationship_types(p_workspace_id))
      and fc.onboarding_stage <> 'live'
      and fc.updated_at < now() - (p_inactivity_days || ' days')::interval
    order by fc.updated_at asc;
end;
$$;

revoke all on function public.get_network_stalled_partners(uuid, integer) from public;
grant execute on function public.get_network_stalled_partners(uuid, integer) to authenticated;
