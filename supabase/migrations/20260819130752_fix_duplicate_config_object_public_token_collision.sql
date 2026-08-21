-- organizer_templates and engagement_letter_templates both have a UNIQUE
-- public_token column. The naive to_jsonb() copy in duplicate_config_object
-- carried the SOURCE row's token verbatim, colliding on insert -- meaning
-- accept_config_object_share had likely never worked for either table.
-- Generate a fresh token unconditionally; jsonb_populate_record ignores
-- object keys with no matching column, so this is a harmless no-op for
-- every other config table type.
create or replace function public.duplicate_config_object(p_table text, p_id uuid, p_target_workspace_id uuid DEFAULT NULL::uuid, p_new_name text DEFAULT NULL::text)
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
  if not public.is_workspace_admin(v_dest_workspace_id) then
    raise exception 'insufficient permissions to duplicate into this workspace';
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
    insert into public.automation_steps (id, automation_id, display_order, action_type, action_config, delay_minutes, requires_approval, approver_role_id)
    select gen_random_uuid(), v_new_id, display_order, action_type, action_config, delay_minutes, requires_approval, approver_role_id
    from public.automation_steps where automation_id = p_id;

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
