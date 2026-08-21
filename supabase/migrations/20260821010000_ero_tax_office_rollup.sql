-- Lets an ERO/SB workspace admin see Tax Office data rolled up across every
-- connected PTIN firm, not just their own workspace (and not just engagements
-- explicitly shared for review, which is all engagement_tax_details' own RLS
-- allows). Narrow SECURITY DEFINER cracks, same pattern as the network
-- messaging RPCs: each function re-validates the caller is an admin of
-- p_workspace_id before touching any other workspace's rows, and only
-- includes workspaces connected via an active ero_ptin firm_connections row.
--
-- "Preparer Metrics" (the other Tax Office tab) is being removed instead --
-- it duplicated Reports > Staff exactly (same v_staff_productivity view),
-- so there's nothing to roll up there.

create or replace function public.get_ero_return_status(p_workspace_id uuid)
returns table (
  source_workspace_id uuid,
  source_workspace_name text,
  engagement_id uuid,
  engagement_number text,
  status text,
  due_date timestamptz,
  tax_year int,
  return_type text,
  efile_status text,
  is_extended boolean,
  federal_refund_amount numeric,
  federal_balance_due numeric,
  client_first_name text,
  client_last_name text,
  client_business_name text,
  client_type text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'Only a workspace admin can view this rollup';
  end if;

  return query
    with target_workspaces as (
      select p_workspace_id as workspace_id, w.name as workspace_name
      from public.workspaces w where w.id = p_workspace_id
      union all
      select fc.child_workspace_id, cw.name
      from public.firm_connections fc
      join public.workspaces cw on cw.id = fc.child_workspace_id
      where fc.parent_workspace_id = p_workspace_id
        and fc.relationship_type = 'ero_ptin'
        and fc.status = 'active'
    )
    select
      tw.workspace_id, tw.workspace_name,
      e.id, e.engagement_number, e.status, e.due_date,
      etd.tax_year, etd.return_type, etd.efile_status, etd.is_extended,
      etd.federal_refund_amount, etd.federal_balance_due,
      c.first_name, c.last_name, c.business_name, c.client_type
    from public.engagement_tax_details etd
    join target_workspaces tw on tw.workspace_id = etd.workspace_id
    join public.engagements e on e.id = etd.engagement_id
    left join public.clients c on c.id = e.client_id
    order by etd.tax_year desc nulls last;
end;
$function$;

create or replace function public.get_ero_irs_notices(p_workspace_id uuid)
returns table (
  source_workspace_id uuid,
  source_workspace_name text,
  notice_id uuid,
  notice_type text,
  notice_date date,
  response_due_date date,
  status text,
  entity_label text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'Only a workspace admin can view this rollup';
  end if;

  return query
    with target_workspaces as (
      select p_workspace_id as workspace_id, w.name as workspace_name
      from public.workspaces w where w.id = p_workspace_id
      union all
      select fc.child_workspace_id, cw.name
      from public.firm_connections fc
      join public.workspaces cw on cw.id = fc.child_workspace_id
      where fc.parent_workspace_id = p_workspace_id
        and fc.relationship_type = 'ero_ptin'
        and fc.status = 'active'
    )
    select
      tw.workspace_id, tw.workspace_name,
      n.id, n.notice_type, n.notice_date, n.response_due_date, n.status,
      coalesce(
        case
          when n.entity_type = 'client' then (
            select case when cc.client_type = 'business' and cc.business_name is not null then cc.business_name
                   else nullif(trim(coalesce(cc.first_name, '') || ' ' || coalesce(cc.last_name, '')), '') end
            from public.clients cc where cc.id = n.entity_id
          )
          when n.entity_type = 'engagement' then (
            select coalesce(ee.engagement_number, 'Engagement') || ' -- ' ||
                   coalesce(
                     case when cc2.client_type = 'business' and cc2.business_name is not null then cc2.business_name
                     else nullif(trim(coalesce(cc2.first_name, '') || ' ' || coalesce(cc2.last_name, '')), '') end,
                     'Unnamed client'
                   )
            from public.engagements ee
            left join public.clients cc2 on cc2.id = ee.client_id
            where ee.id = n.entity_id
          )
        end,
        '--'
      ) as entity_label
    from public.irs_notices n
    join target_workspaces tw on tw.workspace_id = n.workspace_id
    order by n.notice_date desc;
end;
$function$;

create or replace function public.get_ero_extensions(p_workspace_id uuid)
returns table (
  source_workspace_id uuid,
  source_workspace_name text,
  engagement_id uuid,
  engagement_number text,
  tax_year int,
  extension_filed_date date,
  extension_due_date date,
  client_first_name text,
  client_last_name text,
  client_business_name text,
  client_type text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'Only a workspace admin can view this rollup';
  end if;

  return query
    with target_workspaces as (
      select p_workspace_id as workspace_id, w.name as workspace_name
      from public.workspaces w where w.id = p_workspace_id
      union all
      select fc.child_workspace_id, cw.name
      from public.firm_connections fc
      join public.workspaces cw on cw.id = fc.child_workspace_id
      where fc.parent_workspace_id = p_workspace_id
        and fc.relationship_type = 'ero_ptin'
        and fc.status = 'active'
    )
    select
      tw.workspace_id, tw.workspace_name,
      e.id, e.engagement_number,
      etd.tax_year, etd.extension_filed_date, etd.extension_due_date,
      c.first_name, c.last_name, c.business_name, c.client_type
    from public.engagement_tax_details etd
    join target_workspaces tw on tw.workspace_id = etd.workspace_id
    join public.engagements e on e.id = etd.engagement_id
    left join public.clients c on c.id = e.client_id
    where etd.is_extended = true
    order by etd.extension_due_date asc nulls last;
end;
$function$;

create or replace function public.get_ero_tax_year_metrics(p_workspace_id uuid)
returns table (
  source_workspace_id uuid,
  source_workspace_name text,
  tax_year int,
  total_returns bigint,
  accepted bigint,
  rejected bigint,
  transmitted bigint,
  not_filed bigint,
  extended bigint,
  amended bigint,
  open_irs_notices bigint
)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'Only a workspace admin can view this rollup';
  end if;

  return query
    with target_workspaces as (
      select p_workspace_id as workspace_id, w.name as workspace_name
      from public.workspaces w where w.id = p_workspace_id
      union all
      select fc.child_workspace_id, cw.name
      from public.firm_connections fc
      join public.workspaces cw on cw.id = fc.child_workspace_id
      where fc.parent_workspace_id = p_workspace_id
        and fc.relationship_type = 'ero_ptin'
        and fc.status = 'active'
    )
    select
      tw.workspace_id, tw.workspace_name,
      etd.tax_year,
      count(*) as total_returns,
      count(*) filter (where etd.efile_status = 'accepted') as accepted,
      count(*) filter (where etd.efile_status = 'rejected') as rejected,
      count(*) filter (where etd.efile_status = 'transmitted') as transmitted,
      count(*) filter (where etd.efile_status = 'not_filed') as not_filed,
      count(*) filter (where etd.is_extended) as extended,
      count(*) filter (where etd.is_amended) as amended,
      count(distinct n.id) filter (where n.status = 'open') as open_irs_notices
    from public.engagement_tax_details etd
    join target_workspaces tw on tw.workspace_id = etd.workspace_id
    left join public.irs_notices n on n.entity_type = 'engagement' and n.entity_id = etd.engagement_id
    where etd.tax_year is not null
    group by tw.workspace_id, tw.workspace_name, etd.tax_year
    order by etd.tax_year desc, tw.workspace_name;
end;
$function$;

revoke all on function public.get_ero_return_status(uuid) from public, anon;
revoke all on function public.get_ero_irs_notices(uuid) from public, anon;
revoke all on function public.get_ero_extensions(uuid) from public, anon;
revoke all on function public.get_ero_tax_year_metrics(uuid) from public, anon;

grant execute on function public.get_ero_return_status(uuid) to authenticated;
grant execute on function public.get_ero_irs_notices(uuid) to authenticated;
grant execute on function public.get_ero_extensions(uuid) to authenticated;
grant execute on function public.get_ero_tax_year_metrics(uuid) to authenticated;
