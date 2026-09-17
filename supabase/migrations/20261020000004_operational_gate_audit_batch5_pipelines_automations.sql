-- P1: workspace-operational-gate audit -- batch 5 (pipeline/process-stage
-- editing, workflow pipelines, automation step reordering, the shared
-- duplicate_config_object primitive, and workspace tags).
--
-- duplicate_config_object is the shared copy primitive behind
-- accept_config_object_share, duplicate_installed_template, and
-- install_marketplace_template -- gating it here (on the destination
-- workspace) closes the bypass for all of those callers in one place,
-- the same "single chokepoint" pattern used for find_or_create_public_lead.
--
-- reject_automation_step is deliberately NOT gated here: it only cancels
-- an in-flight run (a decline/cleanup action), consistent with
-- reject_client_pending_change and the other decline-type exemptions
-- elsewhere in this audit -- overriding the broader audit pass's initial
-- 🟠 read for consistency with that standing policy.
--
-- rename_workspace_tag / delete_workspace_tag / delete_installed_template
-- (previous batch) / delete_process_stage / delete_workflow_pipeline ARE
-- gated even though several are "removal" actions, because none of them
-- reduce billing/seat/relationship exposure the way revoke_workspace_user
-- or withdraw_engagement_share do -- they're routine configuration edits,
-- gated the same as their "add" counterparts for consistency.

create or replace function public.duplicate_config_object(p_table text, p_id uuid, p_target_workspace_id uuid default null::uuid, p_new_name text default null::text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row jsonb;
  v_source_workspace_id uuid;
  v_dest_workspace_id uuid;
  v_new_id uuid := gen_random_uuid();
  v_new_slug text;
  v_source_process_id uuid;
  v_new_process_id uuid;
  v_map record;
begin
  if not public.is_valid_config_table(p_table) then
    raise exception 'unsupported config table: %', p_table;
  end if;

  execute format('select to_jsonb(t) from public.%I t where t.id = $1', p_table)
    into v_row using p_id;
  if v_row is null then
    raise exception '% % not found', p_table, p_id;
  end if;

  v_source_workspace_id := nullif(v_row->>'workspace_id', '')::uuid;
  v_dest_workspace_id := coalesce(p_target_workspace_id, v_source_workspace_id);

  if v_dest_workspace_id is null then
    raise exception 'a target workspace is required to duplicate a Verexa system object';
  end if;

  if p_table = 'processes' then
    if not public.has_permission(v_dest_workspace_id, 'pipelines.manage') then
      raise exception 'insufficient permissions to duplicate into this workspace';
    end if;
  elsif p_table = 'automations' then
    if not public.has_permission(v_dest_workspace_id, 'automations.manage') then
      raise exception 'insufficient permissions to duplicate into this workspace';
    end if;
  else
    if not public.is_workspace_admin(v_dest_workspace_id) then
      raise exception 'insufficient permissions to duplicate into this workspace';
    end if;
  end if;
  if not public.is_workspace_operational(v_dest_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  if v_source_workspace_id is not null and v_source_workspace_id <> v_dest_workspace_id then
    if not exists (
      select 1 from public.config_object_shares
      where object_type = p_table and object_id = p_id
        and shared_with_workspace_id = v_dest_workspace_id
        and status = 'pending'
    ) then
      raise exception 'cannot duplicate another workspace''s object without an active share to this workspace';
    end if;
  end if;

  v_new_slug := coalesce(v_row->>'slug', 'item') || '-copy-' || left(replace(v_new_id::text, '-', ''), 8);

  v_row := v_row || jsonb_build_object(
    'id', v_new_id,
    'workspace_id', v_dest_workspace_id,
    'slug', v_new_slug,
    'status', 'draft',
    'public_token', gen_random_uuid(),
    'webhook_token', gen_random_uuid(),
    'created_at', now(),
    'updated_at', now()
  );
  if p_new_name is not null then
    v_row := v_row || jsonb_build_object('name', p_new_name);
  end if;
  if p_table = 'services' then
    v_row := v_row || jsonb_build_object('cloned_from_service_id', p_id);
  end if;

  execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)', p_table, p_table)
    using v_row;

  if p_table = 'pipelines' then
    insert into public.pipeline_stages (id, pipeline_id, name, display_order, color, is_terminal)
    select gen_random_uuid(), v_new_id, name, display_order, color, is_terminal
    from public.pipeline_stages where pipeline_id = p_id;

  elsif p_table = 'document_request_templates' then
    insert into public.document_request_items (id, document_request_template_id, category, name, instructions, is_required, conditional_logic, display_order)
    select gen_random_uuid(), v_new_id, category, name, instructions, is_required, conditional_logic, display_order
    from public.document_request_items where document_request_template_id = p_id;

  elsif p_table = 'document_folder_templates' then
    create temporary table if not exists tmp_folder_item_map (old_id uuid primary key, new_id uuid) on commit drop;
    delete from tmp_folder_item_map where true;

    insert into tmp_folder_item_map (old_id, new_id)
    select id, gen_random_uuid() from public.document_folder_template_items where document_folder_template_id = p_id;

    insert into public.document_folder_template_items (id, document_folder_template_id, parent_item_id, name, display_order)
    select m.new_id, v_new_id, pm.new_id, i.name, i.display_order
    from public.document_folder_template_items i
    join tmp_folder_item_map m on m.old_id = i.id
    left join tmp_folder_item_map pm on pm.old_id = i.parent_item_id
    where i.document_folder_template_id = p_id;

  elsif p_table = 'automations' then
    create temporary table if not exists tmp_step_map (old_id uuid primary key, new_id uuid) on commit drop;
    delete from tmp_step_map where true;

    insert into tmp_step_map (old_id, new_id)
    select id, gen_random_uuid() from public.automation_steps where automation_id = p_id;

    insert into public.automation_steps (id, automation_id, display_order, action_type, action_config, delay_minutes, requires_approval, approver_role_id, canvas_x, canvas_y)
    select m.new_id, v_new_id, s.display_order, s.action_type, s.action_config, s.delay_minutes, s.requires_approval, s.approver_role_id, s.canvas_x, s.canvas_y
    from public.automation_steps s
    join tmp_step_map m on m.old_id = s.id
    where s.automation_id = p_id;

    insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order)
    select v_new_id, fm.new_id, tm.new_id, e.branch_conditions, e.label, e.sort_order
    from public.automation_step_edges e
    join tmp_step_map fm on fm.old_id = e.from_step_id
    left join tmp_step_map tm on tm.old_id = e.to_step_id
    where e.automation_id = p_id;

  elsif p_table = 'dashboards' then
    insert into public.dashboard_widgets (id, dashboard_id, widget_type, title, display_order, grid_position, config)
    select gen_random_uuid(), v_new_id, widget_type, title, display_order, grid_position, config
    from public.dashboard_widgets where dashboard_id = p_id;

  elsif p_table = 'organizer_templates' then
    create temporary table if not exists tmp_field_map (old_id uuid primary key, new_id uuid) on commit drop;
    delete from tmp_field_map where true;

    insert into tmp_field_map (old_id, new_id)
    select id, gen_random_uuid() from public.organizer_fields where organizer_template_id = p_id;

    insert into public.organizer_fields (id, organizer_template_id, parent_field_id, field_type, label, help_text, display_order, is_required, options, conditional_logic, validation)
    select m.new_id, v_new_id, pm.new_id, f.field_type, f.label, f.help_text, f.display_order, f.is_required, f.options, f.conditional_logic, f.validation
    from public.organizer_fields f
    join tmp_field_map m on m.old_id = f.id
    left join tmp_field_map pm on pm.old_id = f.parent_field_id
    where f.organizer_template_id = p_id;

    for v_map in select old_id, new_id from tmp_field_map loop
      update public.organizer_fields
      set conditional_logic = replace(conditional_logic::text, v_map.old_id::text, v_map.new_id::text)::jsonb
      where organizer_template_id = v_new_id and conditional_logic::text like '%' || v_map.old_id::text || '%';
    end loop;

  elsif p_table = 'processes' then
    create temporary table if not exists tmp_stage_map (old_id uuid primary key, new_id uuid) on commit drop;
    delete from tmp_stage_map where true;

    insert into tmp_stage_map (old_id, new_id)
    select id, gen_random_uuid() from public.process_stages where process_id = p_id;

    insert into public.process_stages (id, process_id, name, display_order, reviewer_role_id, completion_rule, due_date_rule, entry_conditions, notify_on_entry, expected_duration, warning_threshold, critical_threshold)
    select m.new_id, v_new_id, s.name, s.display_order, s.reviewer_role_id, s.completion_rule, s.due_date_rule, s.entry_conditions, s.notify_on_entry, s.expected_duration, s.warning_threshold, s.critical_threshold
    from public.process_stages s
    join tmp_stage_map m on m.old_id = s.id
    where s.process_id = p_id;

    insert into public.process_tasks (id, process_stage_id, name, description, display_order, assignee_role_id, is_required, due_date_rule, automation_trigger)
    select gen_random_uuid(), m.new_id, t.name, t.description, t.display_order, t.assignee_role_id, t.is_required, t.due_date_rule, t.automation_trigger
    from public.process_tasks t
    join tmp_stage_map m on m.old_id = t.process_stage_id;

  elsif p_table = 'services' then
    v_source_process_id := nullif(v_row->>'process_id', '')::uuid;
    if v_source_process_id is not null then
      v_new_process_id := gen_random_uuid();

      insert into public.processes (id, workspace_id, name, slug, description, status, created_by, created_at, updated_at)
      select v_new_process_id, v_dest_workspace_id, name,
             slug || '-copy-' || left(replace(v_new_process_id::text, '-', ''), 8),
             description, 'draft', auth.uid(), now(), now()
      from public.processes where id = v_source_process_id;

      create temporary table if not exists tmp_stage_map (old_id uuid primary key, new_id uuid) on commit drop;
      delete from tmp_stage_map where true;

      insert into tmp_stage_map (old_id, new_id)
      select id, gen_random_uuid() from public.process_stages where process_id = v_source_process_id;

      insert into public.process_stages (id, process_id, name, display_order, reviewer_role_id, completion_rule, due_date_rule, entry_conditions, notify_on_entry, expected_duration, warning_threshold, critical_threshold)
      select m.new_id, v_new_process_id, s.name, s.display_order, s.reviewer_role_id, s.completion_rule, s.due_date_rule, s.entry_conditions, s.notify_on_entry, s.expected_duration, s.warning_threshold, s.critical_threshold
      from public.process_stages s
      join tmp_stage_map m on m.old_id = s.id
      where s.process_id = v_source_process_id;

      insert into public.process_tasks (id, process_stage_id, name, description, display_order, assignee_role_id, is_required, due_date_rule, automation_trigger)
      select gen_random_uuid(), m.new_id, t.name, t.description, t.display_order, t.assignee_role_id, t.is_required, t.due_date_rule, t.automation_trigger
      from public.process_tasks t
      join tmp_stage_map m on m.old_id = t.process_stage_id;

      update public.services set process_id = v_new_process_id where id = v_new_id;
    end if;
  end if;

  return v_new_id;
end;
$function$;

create or replace function public.advance_pipeline_stage(p_entity_type text, p_entity_id uuid, p_process_id uuid, p_process_stage_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_run_id uuid;
  v_stage_id uuid;
  v_target_stage_id uuid;
  v_target_order int;
  v_current_order int;
  v_loop_guard int;
begin
  if p_entity_type = 'client' then
    select workspace_id into v_workspace_id from public.clients where id = p_entity_id;
  elsif p_entity_type = 'engagement' then
    select workspace_id into v_workspace_id from public.engagements where id = p_entity_id;
  elsif p_entity_type = 'firm_connection' then
    select parent_workspace_id into v_workspace_id from public.firm_connections where id = p_entity_id;
  else
    raise exception 'unsupported entity_type: %', p_entity_type;
  end if;
  if v_workspace_id is null then
    raise exception '% not found', p_entity_type;
  end if;

  if not public.has_permission(v_workspace_id, case p_entity_type when 'client' then 'clients.edit' when 'firm_connection' then 'firm_connections.manage' else 'engagements.manage' end) then
    raise exception 'Not authorized';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  select id, current_stage_id into v_run_id, v_stage_id
  from public.pipeline_runs
  where entity_type = p_entity_type and entity_id = p_entity_id and status = 'Active' and process_id = p_process_id;

  if v_run_id is null then
    v_run_id := public.start_pipeline_run(p_entity_type, p_entity_id, p_process_id);
    select current_stage_id into v_stage_id from public.pipeline_runs where id = v_run_id;
  end if;

  select id into v_target_stage_id from public.pipeline_stages
  where pipeline_run_id = v_run_id and process_stage_id = p_process_stage_id;

  if v_target_stage_id is null then
    raise exception 'Target stage is not part of this pipeline';
  end if;

  select display_order into v_target_order from public.pipeline_stages where id = v_target_stage_id;
  select display_order into v_current_order from public.pipeline_stages where id = v_stage_id;

  if v_target_order < v_current_order then
    raise exception 'Moving backward through pipeline stages is not supported';
  end if;

  v_loop_guard := 0;
  while v_stage_id is distinct from v_target_stage_id and v_loop_guard < 100 loop
    update public.pipeline_stages set status = 'Completed', completed_at = now() where id = v_stage_id;
    select current_stage_id into v_stage_id from public.pipeline_runs where id = v_run_id;
    v_loop_guard := v_loop_guard + 1;
  end loop;
end;
$function$;

create or replace function public.add_process_stage(p_service_id uuid, p_stage_name text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_service record;
  v_process_id uuid;
  v_next_order int;
  v_new_stage_id uuid;
begin
  select id, workspace_id, process_id, name into v_service from services where id = p_service_id;
  if v_service.id is null then
    raise exception 'service % not found', p_service_id;
  end if;
  if v_service.workspace_id is null then
    raise exception 'cannot add stages to a system default service -- clone it first';
  end if;
  if not is_workspace_admin(v_service.workspace_id) then
    raise exception 'insufficient permissions to edit this service''s workflow';
  end if;
  if not public.is_workspace_operational(v_service.workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  v_process_id := v_service.process_id;
  if v_process_id is null then
    v_process_id := gen_random_uuid();
    insert into processes (id, workspace_id, name, slug, created_by)
    values (
      v_process_id, v_service.workspace_id, v_service.name,
      lower(regexp_replace(v_service.name, '[^a-zA-Z0-9]+', '-', 'g')) || '-workflow-' || left(replace(v_process_id::text, '-', ''), 8),
      auth.uid()
    );
    update services set process_id = v_process_id where id = p_service_id;
  end if;

  select coalesce(max(display_order), 0) + 1 into v_next_order from process_stages where process_id = v_process_id;

  v_new_stage_id := gen_random_uuid();
  insert into process_stages (id, process_id, name, display_order)
  values (v_new_stage_id, v_process_id, p_stage_name, v_next_order);

  return v_new_stage_id;
end;
$function$;

create or replace function public.add_process_stage_to_pipeline(p_process_id uuid, p_stage_name text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_process record;
  v_next_order int;
  v_new_stage_id uuid;
begin
  select id, workspace_id into v_process from processes where id = p_process_id;
  if v_process.id is null then
    raise exception 'pipeline % not found', p_process_id;
  end if;
  if v_process.workspace_id is null then
    raise exception 'cannot add stages to a system default pipeline -- clone it first';
  end if;
  if not is_workspace_admin(v_process.workspace_id) then
    raise exception 'insufficient permissions to edit this pipeline';
  end if;
  if not public.is_workspace_operational(v_process.workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  select coalesce(max(display_order), 0) + 1 into v_next_order from process_stages where process_id = p_process_id;

  v_new_stage_id := gen_random_uuid();
  insert into process_stages (id, process_id, name, display_order)
  values (v_new_stage_id, p_process_id, p_stage_name, v_next_order);

  return v_new_stage_id;
end;
$function$;

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
  if not public.is_workspace_operational(v_process.workspace_id) then
    raise exception 'this workspace is not currently operational';
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

create or replace function public.rename_process_stage(p_stage_id uuid, p_new_name text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_stage record;
  v_process record;
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
  if not public.is_workspace_operational(v_process.workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  if p_new_name = v_stage.name then
    return;
  end if;

  update process_stages set name = p_new_name, updated_at = now() where id = p_stage_id;

  update engagements set current_stage = p_new_name
  where workflow_id = v_process.id and current_stage = v_stage.name;
end;
$function$;

create or replace function public.reorder_process_stage(p_stage_id uuid, p_direction text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_stage record;
  v_process record;
  v_neighbor record;
begin
  if p_direction not in ('up', 'down') then
    raise exception 'direction must be up or down';
  end if;

  select ps.id, ps.process_id, ps.display_order into v_stage from process_stages ps where ps.id = p_stage_id;
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
  if not public.is_workspace_operational(v_process.workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  if p_direction = 'up' then
    select * into v_neighbor from public.process_stages
    where process_id = v_stage.process_id and display_order < v_stage.display_order
    order by display_order desc limit 1;
  else
    select * into v_neighbor from public.process_stages
    where process_id = v_stage.process_id and display_order > v_stage.display_order
    order by display_order asc limit 1;
  end if;

  if v_neighbor.id is null then
    return;
  end if;

  update public.process_stages set display_order = v_neighbor.display_order, updated_at = now() where id = v_stage.id;
  update public.process_stages set display_order = v_stage.display_order, updated_at = now() where id = v_neighbor.id;
end;
$function$;

create or replace function public.create_workflow_pipeline(p_workspace_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_process_id uuid := gen_random_uuid();
begin
  if not has_permission(p_workspace_id, 'pipelines.manage') then
    raise exception 'insufficient permissions to create a pipeline in this workspace';
  end if;
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'a pipeline name is required';
  end if;

  insert into processes (id, workspace_id, name, slug, created_by)
  values (
    v_process_id, p_workspace_id, p_name,
    lower(regexp_replace(p_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || left(replace(v_process_id::text, '-', ''), 8),
    auth.uid()
  );

  return v_process_id;
end;
$function$;

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
  if not public.is_workspace_operational(v_process.workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  update engagements set workflow_id = null where workflow_id = p_process_id;
  update services set process_id = null where process_id = p_process_id;

  delete from processes where id = p_process_id;
end;
$function$;

create or replace function public.reorder_automation_step(p_step_id uuid, p_direction text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_step record;
  v_neighbor record;
  v_workspace_id uuid;
begin
  if p_direction not in ('up', 'down') then
    raise exception 'direction must be up or down';
  end if;

  select s.*, a.workspace_id into v_step
  from public.automation_steps s
  join public.automations a on a.id = s.automation_id
  where s.id = p_step_id;

  if v_step.id is null then
    raise exception 'step not found';
  end if;

  v_workspace_id := v_step.workspace_id;
  if v_workspace_id is null or not public.is_workspace_admin(v_workspace_id) then
    raise exception 'insufficient permissions to reorder this workflow''s steps';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  if p_direction = 'up' then
    select * into v_neighbor from public.automation_steps
    where automation_id = v_step.automation_id and display_order < v_step.display_order
    order by display_order desc limit 1;
  else
    select * into v_neighbor from public.automation_steps
    where automation_id = v_step.automation_id and display_order > v_step.display_order
    order by display_order asc limit 1;
  end if;

  if v_neighbor.id is null then
    return;
  end if;

  update public.automation_steps set display_order = v_neighbor.display_order where id = v_step.id;
  update public.automation_steps set display_order = v_step.display_order where id = v_neighbor.id;
end;
$function$;

create or replace function public.rename_workspace_tag(p_workspace_id uuid, p_tag_id uuid, p_new_name text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_old_name text;
  v_new_name text := btrim(p_new_name);
begin
  if not public.has_permission(p_workspace_id, 'automations.manage') then
    raise exception 'insufficient permissions to rename a tag in this workspace';
  end if;
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;
  if v_new_name = '' then
    raise exception 'Tag name cannot be empty';
  end if;

  select name into v_old_name from public.workspace_tags where id = p_tag_id and workspace_id = p_workspace_id;
  if v_old_name is null then
    raise exception 'Tag not found in this workspace';
  end if;
  if v_old_name = v_new_name then
    return;
  end if;
  if exists (select 1 from public.workspace_tags where workspace_id = p_workspace_id and name = v_new_name) then
    raise exception 'A tag named "%" already exists', v_new_name;
  end if;

  update public.workspace_tags set name = v_new_name, updated_at = now() where id = p_tag_id;

  update public.clients
  set tags = array_replace(tags, v_old_name, v_new_name)
  where workspace_id = p_workspace_id and v_old_name = any(tags);

  update public.automations
  set trigger_config = jsonb_set(trigger_config, '{tag}', to_jsonb(v_new_name))
  where workspace_id = p_workspace_id and trigger_type = 'client.tag_added' and trigger_config->>'tag' = v_old_name;

  update public.automations
  set trigger_config = jsonb_set(
    trigger_config, '{tags}',
    (select jsonb_agg(case when elem = v_old_name then to_jsonb(v_new_name) else elem end) from jsonb_array_elements_text(trigger_config->'tags') as elem)
  )
  where workspace_id = p_workspace_id and trigger_type = 'client.tag_added'
    and trigger_config -> 'tags' ? v_old_name;

  update public.automation_steps s
  set action_config = jsonb_set(s.action_config, '{tag}', to_jsonb(v_new_name))
  from public.automations a
  where a.id = s.automation_id and a.workspace_id = p_workspace_id
    and s.action_type in ('add_tag', 'remove_tag') and s.action_config->>'tag' = v_old_name;

  update public.automation_steps s
  set action_config = jsonb_set(
    s.action_config, '{tags}',
    (select jsonb_agg(case when elem = v_old_name then to_jsonb(v_new_name) else elem end) from jsonb_array_elements_text(s.action_config->'tags') as elem)
  )
  from public.automations a
  where a.id = s.automation_id and a.workspace_id = p_workspace_id
    and s.action_type in ('add_tag', 'remove_tag') and s.action_config -> 'tags' ? v_old_name;

  update public.automation_step_edges e
  set branch_conditions = (
    select jsonb_agg(
      case
        when cond->>'field' = 'client.tags' and cond->>'value' = v_old_name
          then jsonb_set(cond, '{value}', to_jsonb(v_new_name))
        else cond
      end
    )
    from jsonb_array_elements(e.branch_conditions) as cond
  )
  from public.automations a
  where a.id = e.automation_id and a.workspace_id = p_workspace_id
    and e.branch_conditions is not null
    and exists (
      select 1 from jsonb_array_elements(e.branch_conditions) as c2
      where c2->>'field' = 'client.tags' and c2->>'value' = v_old_name
    );
end;
$function$;

create or replace function public.delete_workspace_tag(p_workspace_id uuid, p_tag_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_name text;
  v_automation_names text[];
begin
  if not public.has_permission(p_workspace_id, 'automations.manage') then
    raise exception 'insufficient permissions to delete a tag in this workspace';
  end if;
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  select name into v_name from public.workspace_tags where id = p_tag_id and workspace_id = p_workspace_id;
  if v_name is null then
    raise exception 'Tag not found in this workspace';
  end if;

  select array_agg(distinct a.name) into v_automation_names
  from public.automations a
  where a.workspace_id = p_workspace_id
    and (
      (a.trigger_type = 'client.tag_added' and (a.trigger_config->>'tag' = v_name or a.trigger_config -> 'tags' ? v_name))
      or exists (
        select 1 from public.automation_steps s
        where s.automation_id = a.id and s.action_type in ('add_tag', 'remove_tag')
          and (s.action_config->>'tag' = v_name or s.action_config -> 'tags' ? v_name)
      )
      or exists (
        select 1 from public.automation_step_edges e, jsonb_array_elements(coalesce(e.branch_conditions, '[]'::jsonb)) as cond
        where e.automation_id = a.id and cond->>'field' = 'client.tags' and cond->>'value' = v_name
      )
    );

  if v_automation_names is not null and array_length(v_automation_names, 1) > 0 then
    raise exception 'Still used by: %. Update those automations before deleting this tag.', array_to_string(v_automation_names, ', ');
  end if;

  update public.clients set tags = array_remove(tags, v_name) where workspace_id = p_workspace_id and v_name = any(tags);
  delete from public.workspace_tags where id = p_tag_id;
end;
$function$;
