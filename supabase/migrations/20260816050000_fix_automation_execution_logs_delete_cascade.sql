-- automation_steps and automation_runs both cascade on automation delete, but
-- automation_execution_logs.automation_id was left as NO ACTION, so once a
-- workflow has actually run and logged an execution, deleting it fails with
-- a foreign key violation. The frontend delete button doesn't surface that
-- error (fixed separately in WorkflowList.tsx), so it looked like the button
-- was simply doing nothing.
alter table public.automation_execution_logs
  drop constraint automation_execution_logs_automation_id_fkey,
  add constraint automation_execution_logs_automation_id_fkey
    foreign key (automation_id) references public.automations(id) on delete cascade;
