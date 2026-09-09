-- delete_workflow_pipeline still hard-blocked deletion if ANY engagement
-- referenced the pipeline via workflow_id, regardless of that engagement's
-- status -- a lead closed as lost months ago blocked cleanup exactly like
-- one genuinely mid-pipeline today, because the count query never checked
-- status. Mirrors the services.process_id precedent (see
-- 20260823040000_pipeline_delete_unlinks_service_instead_of_blocking.sql):
-- deleting the pipeline now always unlinks every referencing engagement
-- (workflow_id -> null) instead of raising. The engagement record itself,
-- and its history, is untouched -- it just no longer points at a pipeline
-- that no longer exists.
create or replace function public.delete_workflow_pipeline(p_process_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_process record;
begin
  select id, workspace_id, name into v_process from processes where id = p_process_id;
  if v_process.id is null then
    raise exception 'pipeline % not found', p_process_id;
  end if;
  if v_process.workspace_id is null then
    raise exception 'cannot delete a system default pipeline -- clone it to create your own editable copy';
  end if;
  if not is_workspace_admin(v_process.workspace_id) then
    raise exception 'insufficient permissions to delete this pipeline';
  end if;

  update engagements set workflow_id = null where workflow_id = p_process_id;
  update services set process_id = null where process_id = p_process_id;

  delete from processes where id = p_process_id;
end;
$function$;

-- trg_guard_delete_automation (guard_delete_if_wired_to_automation on the
-- automations table) blocked deleting an automation if any OTHER
-- automation's trigger_config/action_config still referenced its id (e.g.
-- a "trigger this workflow" step) -- unrelated to run history, but the
-- same "just let me delete it" complaint applies. The same guard function
-- stays attached to processes/process_stages/config-object deletes
-- (unchanged, still a useful check there); this only drops the automation
-- table's own self-referential copy. After this, a deleted automation's id
-- can be left dangling inside another automation's step config -- that
-- step simply won't resolve at execution time, same as any other
-- misconfigured step.
drop trigger if exists trg_guard_delete_automation on public.automations;
