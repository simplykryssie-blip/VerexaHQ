-- MKB QuickBooks intake workflow: places a newly submitted QuickBooks
-- organizer response into the QuickBooks & Bookkeeping pipeline at its
-- first stage (Consultation Requested). Scheduling into later stages is a
-- manual staff action once an actual consultation appointment is booked --
-- this automation intentionally does nothing beyond the initial placement.
--
-- Built entirely on the existing organizer.submitted / move_pipeline_stage
-- primitives (see fire_organizer_submitted_automations and the
-- move_pipeline_stage branch of execute_automation_step) -- no new trigger
-- type, action type, or workflow engine. A single automation_steps row with
-- no automation_step_edges is a complete, valid one-step automation:
-- start_next_automation_step picks the step with no incoming edge as the
-- entry point, executes it, then finds no outgoing edge and marks the run
-- completed.
--
-- Cross-workspace/cross-organizer isolation, and duplicate-pipeline-entry
-- protection, are both already enforced by the existing engine and require
-- no new logic here:
--   - fire_organizer_submitted_automations only considers automations whose
--     workspace_id matches the submitting organizer response's workspace_id,
--     and this automation's trigger_config.organizer_template_id further
--     restricts it to this one organizer template.
--   - skip_duplicate_active_automation_run blocks a second concurrent
--     'running' automation_runs row for the same automation + client.
--   - move_pipeline_stage itself finds-or-creates a single Active
--     pipeline_run per (entity, process_id) and no-ops when the entity is
--     already at the target stage, so repeated execution never creates a
--     duplicate pipeline entry or moves a lead backward.
do $$
declare
  v_workspace_id uuid := '2896bf43-95db-420f-9bb5-8854f537bbd1';
  v_organizer_template_id uuid := 'a5000000-0000-0000-0000-000000000001';
  v_process_id uuid := 'a3000000-0000-0000-0000-000000000001';
  v_stage_consultation_requested uuid := 'a4000000-0000-0000-0000-000000000001';
  v_automation_id uuid;
begin
  insert into public.automations (workspace_id, name, slug, trigger_type, trigger_config, conditions, is_enabled, status)
  values (
    v_workspace_id, 'QuickBooks Consultation Intake', 'quickbooks-consultation-intake', 'organizer.submitted',
    jsonb_build_object('organizer_template_id', v_organizer_template_id), '[]'::jsonb, true, 'published'
  )
  returning id into v_automation_id;

  insert into public.automation_steps (automation_id, action_type, action_config, display_order)
  values (v_automation_id, 'move_pipeline_stage', jsonb_build_object('process_id', v_process_id, 'process_stage_id', v_stage_consultation_requested), 0);
end $$;
