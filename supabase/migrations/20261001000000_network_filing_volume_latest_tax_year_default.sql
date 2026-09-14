-- Phase 5C P1 correction (Decision 2): get_network_filing_volume previously
-- defaulted to extract(year from now()), which produces a misleading 0 for
-- every Service Bureau today -- real engagement_tax_details rows are tagged
-- to the prior calendar year (tax_year 2025) during the current filing
-- season, not the current calendar year (2026). The default is now
-- data-driven: the latest tax_year with actual qualifying network data for
-- this workspace's own network, falling back to null (not a fabricated
-- year) when there is none at all. An explicit p_tax_year argument still
-- takes priority, unchanged. Only the default-year selection changes here --
-- eligibility scope (network_child_relationship_types), the security gate,
-- and what counts as a "return" are all untouched.
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
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions';
  end if;

  return query
    with eligible as (
      select fc.child_workspace_id
      from public.firm_connections fc
      where fc.parent_workspace_id = p_workspace_id
        and fc.status = 'active'
        and fc.relationship_type = any(public.network_child_relationship_types(p_workspace_id))
        and fc.child_workspace_id is not null
    ),
    resolved_year as (
      select coalesce(
        p_tax_year,
        (
          select max(etd.tax_year)
          from public.engagement_tax_details etd
          join eligible e on e.child_workspace_id = etd.workspace_id
        )
      ) as tax_year
    )
    select
      ry.tax_year,
      coalesce(
        (
          select count(*)
          from public.engagement_tax_details etd
          join eligible e on e.child_workspace_id = etd.workspace_id
          where etd.tax_year = ry.tax_year
        ),
        0
      )
    from resolved_year ry;
end;
$$;
