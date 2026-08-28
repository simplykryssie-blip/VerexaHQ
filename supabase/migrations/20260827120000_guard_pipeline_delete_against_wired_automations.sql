-- delete_workflow_pipeline() already blocks deleting a pipeline with
-- engagements still on it, but process_id/process_stage_id are also
-- hardcoded straight into automation_steps.action_config (move_pipeline_stage)
-- and automations.trigger_config (e.g. lead.stage_entered) with no FK behind
-- them -- deleting the pipeline left those steps silently pointing at
-- nothing. It also didn't check for leads with an active pipeline_runs row
-- on the pipeline, which cascade-deletes (pipeline_runs.process_id is
-- ON DELETE CASCADE) and would have silently wiped their progress.
--
-- Rather than auto-unlinking (fine for services, since a service having no
-- pipeline is a harmless, reversible state) this blocks the delete and
-- names exactly what still depends on the pipeline, the same way the
-- engagement check already does -- so a pipeline can never be deleted out
-- from under a live automation or an in-progress lead by accident.
create or replace function public.delete_workflow_pipeline(p_process_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_process record;
  v_engagement_count int;
  v_active_run_count int;
  v_automation_names text;
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

  select count(*) into v_active_run_count from pipeline_runs where process_id = p_process_id and status = 'Active';
  if v_active_run_count > 0 then
    raise exception '% lead(s) currently have an active run on this pipeline -- move or complete them first, or they''ll lose their progress', v_active_run_count;
  end if;

  select string_agg(distinct a.name, ', ')
    into v_automation_names
  from automations a
  left join automation_steps s on s.automation_id = a.id
  where a.workspace_id = v_process.workspace_id
    and (
      a.trigger_config ->> 'process_id' = p_process_id::text
      or s.action_config ->> 'process_id' = p_process_id::text
    );
  if v_automation_names is not null then
    raise exception 'this pipeline is still wired into automation(s): %. update or remove those steps first', v_automation_names;
  end if;

  update services set process_id = null where process_id = p_process_id;

  delete from processes where id = p_process_id;
end;
$function$;
