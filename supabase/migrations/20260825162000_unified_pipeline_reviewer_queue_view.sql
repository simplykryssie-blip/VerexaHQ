-- v_reviewer_queue was missed in the earlier views pass (20260825155059) --
-- found while sweeping the frontend for remaining workflow_runs/
-- workflow_stages references. Rewritten against the unified tables, same
-- output column names as before so lib/dashboard/data.ts's select("*")
-- needs no changes.
create or replace view public.v_reviewer_queue as
select
  ps.id as workflow_stage_id,
  ps.workspace_id,
  e.engagement_number,
  e.client_id,
  ps.stage_name,
  ps.reviewer_id,
  ps.status,
  ps.due_date,
  ps.started_at,
  e.id as engagement_id
from public.pipeline_stages ps
join public.pipeline_runs pr on pr.id = ps.pipeline_run_id
join public.engagements e on pr.entity_id = e.id
where pr.entity_type = 'engagement'
  and ps.status = any (array['Waiting'::workflow_stage_status, 'In Progress'::workflow_stage_status])
  and ps.reviewer_id is not null;
