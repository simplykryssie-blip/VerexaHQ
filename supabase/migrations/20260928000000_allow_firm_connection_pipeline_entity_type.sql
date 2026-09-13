-- Phase F (20260927060000_firm_scoped_automation_actions.sql) taught
-- start_pipeline_run/advance_pipeline_stage/execute_automation_step's
-- move_pipeline_stage branch to insert entity_type = 'firm_connection', but
-- never widened the CHECK constraints on pipeline_runs/pipeline_stages that
-- still only allow 'client'/'engagement' -- so any automation actually
-- moving a firm-connection-scoped pipeline run (e.g. off a
-- firm_package.purchased trigger) fails with a check-constraint violation.
-- This is a pure constraint widening: no table shape change, no new
-- pipeline system, existing client/engagement rows are untouched.
alter table public.pipeline_runs drop constraint pipeline_runs_entity_type_check;
alter table public.pipeline_runs add constraint pipeline_runs_entity_type_check
  check (entity_type = any (array['client'::text, 'engagement'::text, 'firm_connection'::text]));

alter table public.pipeline_stages drop constraint pipeline_stages_entity_type_check;
alter table public.pipeline_stages add constraint pipeline_stages_entity_type_check
  check (entity_type = any (array['client'::text, 'engagement'::text, 'firm_connection'::text]));
