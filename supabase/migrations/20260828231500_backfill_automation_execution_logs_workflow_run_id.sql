-- Data repair companion to 20260828230000_fix_automation_execution_logs_workflow_run_id.sql.
-- That migration stopped the bug going forward (execute_automation_step now
-- populates workflow_run_id on every new log row) but did nothing for rows
-- already written before the fix. This backfills those, workspace-agnostic
-- -- it repairs every affected row on the platform, not just the demo
-- workspace where the bug was found, using the run id each row already
-- carries in its own execution_data jsonb.

update public.automation_execution_logs
set workflow_run_id = (execution_data->>'run_id')::uuid
where workflow_run_id is null
  and execution_data ? 'run_id';
