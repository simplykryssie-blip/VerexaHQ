-- Backfill lead_pipeline_runs/lead_pipeline_stages and
-- workflow_runs/workflow_stages into the new unified pipeline_runs/
-- pipeline_stages tables, id-remapped via temp maps (same pattern already
-- used elsewhere in this codebase, e.g. duplicate_config_object). A no-op
-- today (both source table families are empty in production), but this
-- runs for correctness/reusability regardless of when it's actually applied.
do $$
declare
  v_run_map jsonb := '{}'::jsonb;
  r record;
  v_new_run_id uuid;
begin
  -- Leads
  for r in select * from public.lead_pipeline_runs loop
    v_new_run_id := gen_random_uuid();
    insert into public.pipeline_runs (id, workspace_id, entity_type, entity_id, process_id, status, current_stage_id, started_at, completed_at, created_at, updated_at)
    values (v_new_run_id, r.workspace_id, 'client', r.client_id, r.process_id, r.status::workflow_run_status, null, r.started_at, r.completed_at, r.created_at, r.updated_at);
    v_run_map := v_run_map || jsonb_build_object(r.id::text, v_new_run_id::text);
  end loop;

  insert into public.pipeline_stages (id, workspace_id, pipeline_run_id, entity_type, process_stage_id, stage_name, display_order, status, started_at, completed_at, created_at, updated_at)
  select gen_random_uuid(), s.workspace_id, (v_run_map ->> s.lead_pipeline_run_id::text)::uuid, 'client', s.process_stage_id, s.stage_name, s.display_order, s.status, s.started_at, s.completed_at, s.created_at, s.updated_at
  from public.lead_pipeline_stages s;

  update public.pipeline_runs pr
  set current_stage_id = ps.id
  from public.pipeline_stages ps, public.lead_pipeline_runs lr
  where pr.id = (v_run_map ->> lr.id::text)::uuid
    and ps.pipeline_run_id = pr.id
    and ps.process_stage_id = (select process_stage_id from public.lead_pipeline_stages where id = lr.current_stage_id);

  -- Engagements
  v_run_map := '{}'::jsonb;
  for r in select * from public.workflow_runs loop
    v_new_run_id := gen_random_uuid();
    insert into public.pipeline_runs (id, workspace_id, entity_type, entity_id, process_id, status, current_stage_id, started_at, completed_at, paused_at, cancelled_at, created_at, updated_at)
    values (v_new_run_id, r.workspace_id, 'engagement', r.engagement_id, r.process_id, r.status, null, r.started_at, r.completed_at, r.paused_at, r.cancelled_at, r.created_at, r.updated_at);
    v_run_map := v_run_map || jsonb_build_object(r.id::text, v_new_run_id::text);
  end loop;

  insert into public.pipeline_stages (id, workspace_id, pipeline_run_id, entity_type, process_stage_id, stage_name, display_order, status, assigned_staff_id, reviewer_id, started_at, completed_at, due_date, estimated_duration, actual_duration, sla_status, notes, created_at, updated_at)
  select gen_random_uuid(), s.workspace_id, (v_run_map ->> s.workflow_run_id::text)::uuid, 'engagement', s.process_stage_id, s.stage_name, s.display_order, s.status, s.assigned_staff_id, s.reviewer_id, s.started_at, s.completed_at, s.due_date, s.estimated_duration, s.actual_duration, s.sla_status, s.notes, s.created_at, s.updated_at
  from public.workflow_stages s;

  update public.pipeline_runs pr
  set current_stage_id = ps.id
  from public.pipeline_stages ps, public.workflow_runs wr
  where pr.id = (v_run_map ->> wr.id::text)::uuid
    and ps.pipeline_run_id = pr.id
    and ps.process_stage_id = (select process_stage_id from public.workflow_stages where id = wr.current_stage_id);
end $$;
