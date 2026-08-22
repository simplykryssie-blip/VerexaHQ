-- Removes the process_tasks -> tasks auto-instantiation feature entirely,
-- platform-wide, per explicit decision: it's shared code identical for
-- every workspace (not something unique to Verexa HQ), and rather than
-- keep it, it's being removed for all workspaces. process_tasks itself
-- (the per-stage checklist templates authored in the Pipelines/Service
-- builder) is untouched -- staff can still author them, they just no
-- longer turn into real tasks automatically when a stage starts.
drop trigger if exists trg_instantiate_process_tasks_for_stage on public.workflow_stages;
drop function if exists public.instantiate_process_tasks_for_stage();
drop index if exists public.tasks_workflow_stage_process_task_uidx;
alter table public.tasks drop column if exists process_task_id;
