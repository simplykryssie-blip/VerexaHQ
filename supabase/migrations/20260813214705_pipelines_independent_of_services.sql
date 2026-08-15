-- First slice of decoupling Workflows/Pipelines from Services: lets a
-- workspace build a Pipeline (a `processes` row + its `process_stages`)
-- directly, without first creating/owning a Service. The existing
-- add_process_stage(p_service_id, ...) bootstraps a process FROM a
-- service and stays untouched -- these are its process-native siblings,
-- used by the new /pipelines UI. Per-stage organizer/document/engagement
-- letter attachment already works directly off process_stages (see
-- StageTemplateAttachments in StageEditor.tsx), so no schema change is
-- needed for that part -- it just needed a way to create a process
-- without a service in front of it.

create or replace function public.create_workflow_pipeline(p_workspace_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_process_id uuid := gen_random_uuid();
begin
  if not is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to create a pipeline in this workspace';
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
$$;

create or replace function public.add_process_stage_to_pipeline(p_process_id uuid, p_stage_name text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
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

  select coalesce(max(display_order), 0) + 1 into v_next_order from process_stages where process_id = p_process_id;

  v_new_stage_id := gen_random_uuid();
  insert into process_stages (id, process_id, name, display_order)
  values (v_new_stage_id, p_process_id, p_stage_name, v_next_order);

  return v_new_stage_id;
end;
$$;
