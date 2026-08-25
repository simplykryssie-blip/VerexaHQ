-- Final cutover for the lead/engagement pipeline unification. Everything
-- that read/wrote lead_pipeline_runs/lead_pipeline_stages or
-- workflow_runs/workflow_stages has been repointed at pipeline_runs/
-- pipeline_stages (schema, backfill, and function/trigger/view migrations
-- already applied and verified with a live functional test: a lead moving
-- through move_pipeline_stage, create_engagement's handoff repointing an
-- existing active run instead of duplicating it, and the e-file
-- accept/reject flow auto-skipping via stage_role). Both source table
-- families were confirmed empty (0 rows) before this ran, so this is a
-- structural cleanup, not a live-data cutover.

-- Two other tables held foreign keys into the tables being dropped, both
-- confirmed to have zero non-null values in the referencing column:
-- automation_execution_logs.workflow_run_id (dead/unused column on an
-- otherwise-empty table) and tasks.workflow_stage_id (selected by the
-- engagement page but never actually rendered/consumed -- pre-existing
-- dead weight, out of scope to migrate here). Dropping just the
-- constraints, not the columns, keeps this cutover scoped to the pipeline
-- tables themselves.
alter table public.automation_execution_logs drop constraint automation_execution_logs_workflow_run_id_fkey;
alter table public.tasks drop constraint tasks_workflow_stage_id_fkey;

-- Each run/stage pair has a circular FK (run.current_stage_id -> stage,
-- stage.run_id -> run) -- drop the run-side one first so the tables can
-- come down without CASCADE.
alter table public.lead_pipeline_runs drop constraint lead_pipeline_runs_current_stage_fkey;
alter table public.workflow_runs drop constraint fk_current_stage;

drop table public.lead_pipeline_stages;
drop table public.lead_pipeline_runs;
drop table public.workflow_stages;
drop table public.workflow_runs;

drop function public.start_lead_pipeline_run(uuid, uuid);
drop function public.start_engagement_workflow(uuid, uuid);
drop function public.advance_lead_pipeline_on_stage_completed();
drop function public.advance_workflow_on_stage_completed();
drop function public.advance_lead_pipeline_stage(uuid, uuid, uuid);
drop function public.fire_lead_pipeline_stage_entered_automations();
drop function public.fire_workflow_stage_entered_automations();
drop function public.apply_workflow_stage_default_assignment();
drop function public.audit_workflow_event();

-- move_lead_stage/move_engagement_stage are fully retired now that every
-- automation_steps row referencing them was migrated to move_pipeline_stage
-- (verified: all 7 existing rows moved over cleanly).
alter table public.automation_steps drop constraint automation_steps_action_type_check;
alter table public.automation_steps add constraint automation_steps_action_type_check
  check (action_type = any (array[
    'send_email', 'send_sms', 'send_notification', 'create_task', 'assign_user', 'change_stage',
    'request_approval', 'delay', 'webhook', 'escalate', 'send_organizer_template', 'create_engagement',
    'send_engagement_letter', 'send_document_request',
    'move_pipeline_stage', 'mark_lead_lost',
    'convert_lead_to_client', 'update_client', 'create_client', 'create_quote', 'send_quote',
    'add_tag', 'remove_tag', 'add_note', 'send_portal_message', 'start_workflow', 'end_workflow',
    'invite_to_portal', 'condition', 'create_appointment', 'add_dnd', 'remove_dnd',
    'move_lead_to_service_pipeline', 'business_hours_delay'
  ]));
