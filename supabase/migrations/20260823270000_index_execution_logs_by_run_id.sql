-- The run-detail panel filters automation_execution_logs by the run_id
-- embedded in execution_data (there's no normalized run_id column -- see
-- the insert in execute_automation_step). Index that lookup path directly
-- rather than relying on a sequential scan as log volume grows.
create index if not exists automation_execution_logs_run_id_idx
  on public.automation_execution_logs ((execution_data ->> 'run_id'));
