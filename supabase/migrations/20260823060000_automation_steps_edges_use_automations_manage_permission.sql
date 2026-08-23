-- automation_steps and automation_step_edges were still gated on
-- is_workspace_admin (owner/admin role only), unlike their parent
-- automations table (automations_insert/update/delete already use
-- has_permission(workspace_id, 'automations.manage')) and unlike the
-- "Add step" UI itself, whose canManage prop is has_permission(...,
-- 'automations.manage') too. A staff/ero/manager user with
-- automations.manage granted -- who can already create and edit the
-- automation itself -- saw the Add step button fully enabled, but every
-- actual step or edge insert/update/delete silently failed RLS. Same
-- bug class as the pipelines.manage fix earlier (processes/process_
-- stages/process_tasks), just never applied here.

drop policy automation_steps_insert on public.automation_steps;
create policy automation_steps_insert on public.automation_steps
  for insert with check (
    exists (select 1 from public.automations a where a.id = automation_steps.automation_id and a.workspace_id is not null and has_permission(a.workspace_id, 'automations.manage'))
  );

drop policy automation_steps_update on public.automation_steps;
create policy automation_steps_update on public.automation_steps
  for update using (
    exists (select 1 from public.automations a where a.id = automation_steps.automation_id and a.workspace_id is not null and has_permission(a.workspace_id, 'automations.manage'))
  );

drop policy automation_steps_delete on public.automation_steps;
create policy automation_steps_delete on public.automation_steps
  for delete using (
    exists (select 1 from public.automations a where a.id = automation_steps.automation_id and a.workspace_id is not null and has_permission(a.workspace_id, 'automations.manage'))
  );

drop policy automation_step_edges_insert on public.automation_step_edges;
create policy automation_step_edges_insert on public.automation_step_edges
  for insert with check (
    exists (select 1 from public.automations a where a.id = automation_step_edges.automation_id and a.workspace_id is not null and has_permission(a.workspace_id, 'automations.manage'))
  );

drop policy automation_step_edges_update on public.automation_step_edges;
create policy automation_step_edges_update on public.automation_step_edges
  for update using (
    exists (select 1 from public.automations a where a.id = automation_step_edges.automation_id and a.workspace_id is not null and has_permission(a.workspace_id, 'automations.manage'))
  );

drop policy automation_step_edges_delete on public.automation_step_edges;
create policy automation_step_edges_delete on public.automation_step_edges
  for delete using (
    exists (select 1 from public.automations a where a.id = automation_step_edges.automation_id and a.workspace_id is not null and has_permission(a.workspace_id, 'automations.manage'))
  );

-- Regression fix: delete_workflow_pipeline was rewritten in an earlier
-- migration today (pipeline deletion unlinking services instead of
-- blocking) from a stale copy on disk that predated the pipelines.manage
-- permission fix, silently reverting its permission check from
-- has_permission(..., 'pipelines.manage') back to is_workspace_admin.
-- Restores it.
create or replace function public.delete_workflow_pipeline(p_process_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_process record;
  v_engagement_count int;
begin
  select id, workspace_id, name into v_process from processes where id = p_process_id;
  if v_process.id is null then
    raise exception 'pipeline % not found', p_process_id;
  end if;
  if v_process.workspace_id is null then
    raise exception 'cannot delete a system default pipeline -- clone it to create your own editable copy';
  end if;
  if not has_permission(v_process.workspace_id, 'pipelines.manage') then
    raise exception 'insufficient permissions to delete this pipeline';
  end if;

  select count(*) into v_engagement_count from engagements where workflow_id = p_process_id;
  if v_engagement_count > 0 then
    raise exception '% engagement(s) are still running this pipeline -- it can''t be deleted while they''re in progress', v_engagement_count;
  end if;

  update services set process_id = null where process_id = p_process_id;

  delete from processes where id = p_process_id;
end;
$function$;
