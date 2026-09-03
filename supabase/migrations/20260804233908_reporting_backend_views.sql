-- Staff/Preparer/Review metrics in one query instead of every report
-- re-deriving them client-side from three separate table fetches. Reuses
-- v_reviewer_queue rather than re-deriving pending reviews from scratch.
-- security_invoker=true (same convention as every other v_* view in this
-- schema) so RLS on the underlying tables still applies to the caller.
create view public.v_staff_productivity with (security_invoker=true) as
select
  wu.workspace_id,
  wu.user_id as staff_id,
  count(distinct e.id) filter (where e.status not in ('Completed','Archived')) as open_engagements,
  count(distinct e.id) filter (where e.status = 'Completed' and e.completed_date >= date_trunc('month', now())) as engagements_completed_this_month,
  count(distinct t.id) filter (where t.status = 'completed') as tasks_completed,
  count(distinct t.id) filter (where t.status <> 'completed' and t.due_date < now()) as tasks_overdue,
  count(distinct rq.workflow_stage_id) as pending_reviews
from public.workspace_users wu
left join public.engagements e on e.assigned_staff_id = wu.user_id and e.workspace_id = wu.workspace_id
left join public.tasks t on t.assigned_staff_id = wu.user_id and t.workspace_id = wu.workspace_id
left join public.v_reviewer_queue rq on rq.reviewer_id = wu.user_id and rq.workspace_id = wu.workspace_id
where wu.status = 'active'
group by wu.workspace_id, wu.user_id;

-- Tax Season Metrics: return volume/status/extension/notice counts by
-- tax year, built on the new engagement_tax_details/irs_notices tables
-- rather than duplicating their logic.
create view public.v_tax_season_metrics with (security_invoker=true) as
select
  td.workspace_id,
  td.tax_year,
  count(*) as total_returns,
  count(*) filter (where td.efile_status = 'accepted') as accepted,
  count(*) filter (where td.efile_status = 'rejected') as rejected,
  count(*) filter (where td.efile_status = 'transmitted') as transmitted,
  count(*) filter (where td.efile_status = 'not_filed') as not_filed,
  count(*) filter (where td.is_extended) as extended,
  count(*) filter (where td.is_amended) as amended,
  count(distinct n.id) filter (where n.status = 'open') as open_irs_notices
from public.engagement_tax_details td
left join public.irs_notices n on n.entity_type = 'engagement' and n.entity_id = td.engagement_id
where td.tax_year is not null
group by td.workspace_id, td.tax_year;
