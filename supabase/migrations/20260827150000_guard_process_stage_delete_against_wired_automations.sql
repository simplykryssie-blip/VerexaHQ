-- Same gap as delete_workflow_pipeline had before we guarded it: deleting a
-- single stage (rather than the whole pipeline) never checked whether an
-- automation's move_pipeline_stage action or lead.stage_entered/
-- engagement.stage_entered trigger still targets that stage. This is not
-- hypothetical -- automation "Tax Organizer Intake & Review - Additional
-- Info Requested" (id e3b40499-ca69-464e-ace9-0894bb4a239e) is currently
-- enabled and published with a trigger_config.process_stage_id that no
-- longer exists, so it can never fire; that's this exact bug, already live.
create or replace function public.delete_process_stage(p_stage_id uuid, p_destination_stage_id uuid default null::uuid, p_new_stage_name text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_stage record;
  v_process record;
  v_stage_count int;
  v_affected int;
  v_destination_name text;
  v_next_order int;
  v_automation_names text;
begin
  select ps.id, ps.process_id, ps.name into v_stage from process_stages ps where ps.id = p_stage_id;
  if v_stage.id is null then
    raise exception 'stage % not found', p_stage_id;
  end if;

  select p.id, p.workspace_id into v_process from processes p where p.id = v_stage.process_id;
  if v_process.workspace_id is null then
    raise exception 'cannot edit a system default workflow -- clone the service first';
  end if;
  if not is_workspace_admin(v_process.workspace_id) then
    raise exception 'insufficient permissions to edit this workflow';
  end if;

  select count(*) into v_stage_count from process_stages where process_id = v_process.id;
  if v_stage_count <= 1 then
    raise exception 'cannot delete the last stage of a workflow -- delete the service or process instead if it''s no longer needed';
  end if;

  select string_agg(distinct a.name, ', ')
    into v_automation_names
  from automations a
  left join automation_steps s on s.automation_id = a.id
  where a.workspace_id = v_process.workspace_id
    and (
      a.trigger_config ->> 'process_stage_id' = p_stage_id::text
      or s.action_config ->> 'process_stage_id' = p_stage_id::text
    );
  if v_automation_names is not null then
    raise exception 'this stage is still wired into automation(s): %. update or remove those steps first', v_automation_names;
  end if;

  select count(*) into v_affected from engagements where workflow_id = v_process.id and current_stage = v_stage.name;

  if v_affected > 0 then
    if p_destination_stage_id is not null then
      select name into v_destination_name from process_stages where id = p_destination_stage_id and process_id = v_process.id;
      if v_destination_name is null then
        raise exception 'destination stage does not belong to this workflow';
      end if;
    elsif p_new_stage_name is not null then
      select coalesce(max(display_order), 0) + 1 into v_next_order from process_stages where process_id = v_process.id;
      insert into process_stages (id, process_id, name, display_order)
      values (gen_random_uuid(), v_process.id, p_new_stage_name, v_next_order)
      returning name into v_destination_name;
    else
      raise exception '% engagement(s) are on this stage -- choose a destination', v_affected;
    end if;

    update engagements set current_stage = v_destination_name
    where workflow_id = v_process.id and current_stage = v_stage.name;
  end if;

  delete from process_stages where id = p_stage_id;
end;
$function$;
