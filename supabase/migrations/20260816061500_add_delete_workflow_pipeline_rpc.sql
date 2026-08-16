-- There was no way to delete a pipeline -- only its individual stages
-- (delete_process_stage) and the create path (create_workflow_pipeline)
-- existed. delete_process_stage's own error message even says "delete
-- the service or process instead if it's no longer needed", implying
-- this was meant to exist. Mirrors delete_process_stage's safety pattern:
-- block cleanly (with counts) rather than silently detach/orphan data,
-- and refuse to touch system-default (workspace_id is null) pipelines.
create or replace function public.delete_workflow_pipeline(p_process_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_process record;
  v_service_count int;
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

  select count(*) into v_service_count from services where process_id = p_process_id;
  if v_service_count > 0 then
    raise exception '% service(s) still use this pipeline -- remove it from those services first', v_service_count;
  end if;

  select count(*) into v_engagement_count from engagements where workflow_id = p_process_id;
  if v_engagement_count > 0 then
    raise exception '% engagement(s) are still running this pipeline -- it can''t be deleted while they''re in progress', v_engagement_count;
  end if;

  delete from processes where id = p_process_id;
end;
$function$;
