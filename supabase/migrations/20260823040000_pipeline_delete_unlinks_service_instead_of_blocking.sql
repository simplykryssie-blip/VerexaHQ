-- delete_workflow_pipeline hard-blocked deletion of any pipeline still
-- referenced by services.process_id ("N service(s) still use this
-- pipeline -- remove it from those services first"), with no UI path to
-- do that unlinking -- deleting a workspace's automations (the only
-- lever exposed) does nothing to that reference, so every one of the 9
-- service pipelines built earlier was permanently stuck.
--
-- services.process_id is just "which pipeline a service currently
-- starts new engagements on" -- metadata, not in-progress work -- so a
-- pipeline being someone's current default shouldn't trap it forever.
-- Deleting the pipeline now unlinks it from any services pointing at it
-- (process_id -> null) instead of raising. The real safety check stays:
-- still refuse to delete a pipeline that has engagements actively
-- running on it (engagements.workflow_id), since that's real in-progress
-- data, not just a default pointer.

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
  if not is_workspace_admin(v_process.workspace_id) then
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
