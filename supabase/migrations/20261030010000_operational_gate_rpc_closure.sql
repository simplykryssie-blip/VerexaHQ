-- Suspension/Archive lifecycle hardening, item 2 (SECURITY DEFINER RPC
-- closure pass). These four RPCs run SECURITY DEFINER, so they bypass RLS
-- entirely -- the RLS fixes in 20261030000000 never even run for calls
-- through these functions. Each function is reproduced in full (per
-- Postgres CREATE OR REPLACE semantics -- there is no way to patch a
-- plpgsql body in place) with exactly one addition: an
-- is_workspace_operational() check alongside the existing permission
-- check, never replacing it. No other logic in any of these functions is
-- changed.

CREATE OR REPLACE FUNCTION public.create_engagement(p_workspace_id uuid, p_client_id uuid, p_service_id uuid DEFAULT NULL::uuid, p_assigned_staff_id uuid DEFAULT NULL::uuid, p_priority engagement_priority DEFAULT 'Medium'::engagement_priority, p_billing_rule_id uuid DEFAULT NULL::uuid, p_process_id uuid DEFAULT NULL::uuid, p_case_type text DEFAULT 'other'::text, p_due_date timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_service record;
  v_process record;
  v_engagement_id uuid;
  v_billing_rule_id uuid;
  v_process_id uuid;
  v_handoff_run_id uuid;
begin
  if not has_permission(p_workspace_id, 'engagements.manage') then
    raise exception 'insufficient permissions to create an engagement in this workspace';
  end if;
  if not is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  if p_service_id is not null then
    select id, process_id, billing_rule_id into v_service from services
    where id = p_service_id and (workspace_id is null or workspace_id = p_workspace_id);
    if v_service.id is null then raise exception 'service % not found or not accessible in this workspace', p_service_id; end if;
    v_billing_rule_id := coalesce(p_billing_rule_id, v_service.billing_rule_id);
  else
    v_billing_rule_id := p_billing_rule_id;
  end if;

  if p_process_id is not null then
    select id into v_process from processes where id = p_process_id and (workspace_id is null or workspace_id = p_workspace_id);
    if v_process.id is null then raise exception 'pipeline % not found or not accessible in this workspace', p_process_id; end if;
    v_process_id := p_process_id;
  elsif p_service_id is not null then
    v_process_id := v_service.process_id;
  else
    v_process_id := null;
  end if;

  insert into engagements (workspace_id, client_id, service_id, workflow_id, assigned_staff_id, priority, billing_rule_id, case_type, due_date)
  values (p_workspace_id, p_client_id, p_service_id, v_process_id, p_assigned_staff_id, p_priority, v_billing_rule_id, coalesce(p_case_type, 'other'), p_due_date)
  returning id into v_engagement_id;

  if v_process_id is not null then
    update pipeline_runs
    set entity_type = 'engagement', entity_id = v_engagement_id
    where entity_type = 'client' and entity_id = p_client_id
      and process_id = v_process_id and status = 'Active'
    returning id into v_handoff_run_id;

    if v_handoff_run_id is not null then
      update pipeline_stages set entity_type = 'engagement' where pipeline_run_id = v_handoff_run_id;
    else
      perform start_pipeline_run('engagement', v_engagement_id, v_process_id);
    end if;
  end if;

  return v_engagement_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_document_request(p_workspace_id uuid, p_entity_type text, p_entity_id uuid, p_template_id uuid, p_title text, p_due_date date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_request_id uuid;
begin
  if not public.has_permission(p_workspace_id, 'documents.request') then
    raise exception 'insufficient permissions to request documents in this workspace';
  end if;
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  insert into public.document_requests (workspace_id, entity_type, entity_id, document_request_template_id, title, due_date, created_by)
  values (p_workspace_id, p_entity_type, p_entity_id, p_template_id, p_title, p_due_date, auth.uid())
  returning id into v_request_id;

  insert into public.document_request_item_statuses (document_request_id, document_request_item_id, name, is_required, category, status, fulfilled_by_attachment_id)
  select
    v_request_id,
    dri.id,
    dri.name,
    dri.is_required,
    dri.category,
    coalesce(prior.status, 'pending'),
    prior.fulfilled_by_attachment_id
  from public.document_request_items dri
  left join lateral (
    select s.status, s.fulfilled_by_attachment_id
    from public.document_request_item_statuses s
    join public.document_requests r on r.id = s.document_request_id
    where r.entity_type = p_entity_type
      and r.entity_id = p_entity_id
      and s.name = dri.name
      and s.status <> 'pending'
    order by s.updated_at desc
    limit 1
  ) prior on true
  where dri.document_request_template_id = p_template_id;

  return v_request_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_workflow_pipeline(p_workspace_id uuid, p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_process_id uuid := gen_random_uuid();
begin
  if not has_permission(p_workspace_id, 'pipelines.manage') then
    raise exception 'insufficient permissions to create a pipeline in this workspace';
  end if;
  if not is_workspace_operational(p_workspace_id) then
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
$function$
;

CREATE OR REPLACE FUNCTION public.duplicate_config_object(p_table text, p_id uuid, p_target_workspace_id uuid DEFAULT NULL::uuid, p_new_name text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  if not public.is_workspace_operational(v_dest_workspace_id) then
    raise exception 'this workspace is not currently operational';
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

  -- 'public_token'/'webhook_token' are included unconditionally:
  -- organizer_templates/engagement_letter_templates have a UNIQUE
  -- public_token, and automations has a UNIQUE webhook_token -- the
  -- naive to_jsonb() copy above carries the SOURCE row's value
  -- verbatim, which collides on insert. jsonb_populate_record ignores
  -- object keys with no matching column, so this is a harmless no-op
  -- for every config table type that doesn't have that column.
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
$function$
;
