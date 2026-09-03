create or replace view public.v_reviewer_queue with (security_invoker=true) as
 select ws.id as workflow_stage_id,
    ws.workspace_id,
    e.engagement_number,
    e.client_id,
    ws.stage_name,
    ws.reviewer_id,
    ws.status,
    ws.due_date,
    ws.started_at,
    e.id as engagement_id
   from (workflow_stages ws
     join workflow_runs wr on ((ws.workflow_run_id = wr.id)))
     join engagements e on ((wr.engagement_id = e.id))
  where ((ws.status = any (array['Waiting'::workflow_stage_status, 'In Progress'::workflow_stage_status])) and (ws.reviewer_id is not null));
