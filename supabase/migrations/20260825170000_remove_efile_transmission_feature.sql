-- This firm doesn't efile or transmit returns -- rips out the e-file
-- transmission feature rather than leaving it as unused/misleading UI:
-- the stage_role efile_decision/efile_rejected auto-skip mechanism, the
-- EfileDecisionActions accept/reject buttons, and the transmitted/accepted/
-- rejected states on engagement_tax_details.
--
-- The column isn't dropped outright, though -- a real row exists with
-- efile_status = 'ready_to_file', which is a legitimate "the return is
-- ready to go out" state regardless of how it's filed. Renamed to
-- return_status and narrowed to the three states that make sense without
-- e-file: not_filed / ready_to_file / filed (transmitted+accepted+
-- paper_filed all become "filed"; rejected, unused today, would map to
-- not_filed since a rejected e-file was never actually filed).
alter table public.engagement_tax_details rename column efile_status to return_status;
alter table public.engagement_tax_details drop constraint engagement_tax_details_efile_status_check;

update public.engagement_tax_details set return_status = 'filed' where return_status in ('transmitted', 'accepted', 'paper_filed');
update public.engagement_tax_details set return_status = 'not_filed' where return_status = 'rejected';

alter table public.engagement_tax_details add constraint engagement_tax_details_return_status_check
  check (return_status = any (array['not_filed', 'ready_to_file', 'filed']));

alter table public.engagement_tax_details drop column efile_transmitted_at;
alter table public.engagement_tax_details drop column efile_accepted_at;
alter table public.engagement_tax_details drop column efile_rejected_reason;

-- The e-file auto-skip branch in advance_pipeline_on_stage_completed()
-- (added in 20260825155059) no longer applies -- every stage now just
-- advances sequentially like any other, including whatever stage the
-- firm currently labels for filing.
create or replace function public.advance_pipeline_on_stage_completed()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_entity_type text;
  v_entity_id uuid;
  v_next_stage_id uuid;
begin
  select entity_type, entity_id into v_entity_type, v_entity_id
  from public.pipeline_runs where id = new.pipeline_run_id;

  select id into v_next_stage_id from public.pipeline_stages
  where pipeline_run_id = new.pipeline_run_id
    and display_order > new.display_order
    and status not in ('Completed', 'Skipped')
  order by display_order asc limit 1;

  if v_next_stage_id is not null then
    update public.pipeline_runs set current_stage_id = v_next_stage_id where id = new.pipeline_run_id;
    update public.pipeline_stages set status = 'In Progress', started_at = now() where id = v_next_stage_id;
  else
    update public.pipeline_runs set status = 'Completed', completed_at = now() where id = new.pipeline_run_id;
    if v_entity_type = 'engagement' then
      update public.engagements set status = 'Completed', completed_date = now() where id = v_entity_id;
    end if;
  end if;

  return new;
end;
$function$;

alter table public.process_stages drop column stage_role;

-- Return Status / Tax Year Metrics rollups, rewritten against return_status
-- with the e-file-specific breakdown (accepted/rejected/transmitted)
-- collapsed into filed/ready_to_file/not_filed.
drop view public.v_tax_season_metrics;

create view public.v_tax_season_metrics as
select
  td.workspace_id,
  td.tax_year,
  count(*) as total_returns,
  count(*) filter (where td.return_status = 'filed') as filed,
  count(*) filter (where td.return_status = 'ready_to_file') as ready_to_file,
  count(*) filter (where td.return_status = 'not_filed') as not_filed,
  count(*) filter (where td.is_extended) as extended,
  count(*) filter (where td.is_amended) as amended,
  count(distinct n.id) filter (where n.status = 'open') as open_irs_notices
from public.engagement_tax_details td
left join public.irs_notices n on n.entity_type = 'engagement' and n.entity_id = td.engagement_id
where td.tax_year is not null
group by td.workspace_id, td.tax_year;

drop function public.get_ero_return_status(uuid);
drop function public.get_ero_tax_year_metrics(uuid);

create function public.get_ero_return_status(p_workspace_id uuid)
returns table(source_workspace_id uuid, source_workspace_name text, engagement_id uuid, engagement_number text, status text, due_date timestamp with time zone, tax_year integer, return_type text, return_status text, is_extended boolean, federal_refund_amount numeric, federal_balance_due numeric, client_first_name text, client_last_name text, client_business_name text, client_type text)
language plpgsql
stable security definer
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
      etd.tax_year, etd.return_type, etd.return_status, etd.is_extended,
      etd.federal_refund_amount, etd.federal_balance_due,
      c.first_name, c.last_name, c.business_name, c.client_type
    from public.engagement_tax_details etd
    join target_workspaces tw on tw.workspace_id = etd.workspace_id
    join public.engagements e on e.id = etd.engagement_id
    left join public.clients c on c.id = e.client_id
    order by etd.tax_year desc nulls last;
end;
$function$;

create function public.get_ero_tax_year_metrics(p_workspace_id uuid)
returns table(source_workspace_id uuid, source_workspace_name text, tax_year integer, total_returns bigint, filed bigint, ready_to_file bigint, not_filed bigint, extended bigint, amended bigint, open_irs_notices bigint)
language plpgsql
stable security definer
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
      count(*) filter (where etd.return_status = 'filed') as filed,
      count(*) filter (where etd.return_status = 'ready_to_file') as ready_to_file,
      count(*) filter (where etd.return_status = 'not_filed') as not_filed,
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
