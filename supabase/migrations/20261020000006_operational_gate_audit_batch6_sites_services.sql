-- P1: workspace-operational-gate audit -- batch 6 (website/funnel section
-- reordering, activating a new service). Found via a final sweep of the
-- codebase, not the originally-scoped domain list, but the same exact
-- bypass class: site_pages/site_websites RLS already has the operational
-- check, but these SECURITY DEFINER RPCs write directly to
-- site_pages/site_page_sections/site_popup_sections and bypass it.
-- turn_on_service activates a brand-new service (a real growth action,
-- same shape as create_client) with no gate anywhere.

create or replace function public.reorder_funnel_pages(p_funnel_id uuid, p_page_ids uuid[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_page_id uuid;
  v_idx int := 0;
  v_total int;
  v_matched int;
begin
  select workspace_id into v_workspace_id from public.site_funnels where id = p_funnel_id;
  if v_workspace_id is null then
    raise exception 'funnel not found';
  end if;
  if not public.has_permission(v_workspace_id, 'site_pages.manage') then
    raise exception 'insufficient permissions to edit this funnel';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  select count(*) into v_total from public.site_pages where funnel_id = p_funnel_id;
  if coalesce(array_length(p_page_ids, 1), 0) <> v_total then
    raise exception 'reorder list must include every page in this funnel exactly once';
  end if;

  select count(*) into v_matched from public.site_pages where funnel_id = p_funnel_id and id = any(p_page_ids);
  if v_matched <> v_total then
    raise exception 'reorder list must include every page in this funnel exactly once';
  end if;

  foreach v_page_id in array p_page_ids loop
    update public.site_pages set funnel_position = v_idx, updated_at = now() where id = v_page_id;
    v_idx := v_idx + 1;
  end loop;
end;
$function$;

create or replace function public.reorder_site_page_sections(p_page_id uuid, p_section_ids uuid[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_section_id uuid;
  v_idx int := 0;
  v_total int;
  v_matched int;
begin
  select workspace_id into v_workspace_id from public.site_pages where id = p_page_id;
  if v_workspace_id is null then
    raise exception 'page not found';
  end if;
  if not public.has_permission(v_workspace_id, 'site_pages.manage') then
    raise exception 'insufficient permissions to edit this page';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  select count(*) into v_total from public.site_page_sections where page_id = p_page_id;
  if coalesce(array_length(p_section_ids, 1), 0) <> v_total then
    raise exception 'reorder list must include every section on this page exactly once';
  end if;

  select count(*) into v_matched from public.site_page_sections where page_id = p_page_id and id = any(p_section_ids);
  if v_matched <> v_total then
    raise exception 'reorder list must include every section on this page exactly once';
  end if;

  foreach v_section_id in array p_section_ids loop
    update public.site_page_sections set display_order = v_idx, updated_at = now() where id = v_section_id;
    v_idx := v_idx + 1;
  end loop;
end;
$function$;

create or replace function public.reorder_site_popup_sections(p_popup_id uuid, p_section_ids uuid[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_section_id uuid;
  v_idx int := 0;
  v_total int;
  v_matched int;
begin
  select workspace_id into v_workspace_id from public.site_popups where id = p_popup_id;
  if v_workspace_id is null then
    raise exception 'popup not found';
  end if;
  if not public.has_permission(v_workspace_id, 'site_pages.manage') then
    raise exception 'insufficient permissions to edit this popup';
  end if;
  if not public.is_workspace_operational(v_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  select count(*) into v_total from public.site_popup_sections where popup_id = p_popup_id;
  if coalesce(array_length(p_section_ids, 1), 0) <> v_total then
    raise exception 'reorder list must include every section on this popup exactly once';
  end if;

  select count(*) into v_matched from public.site_popup_sections where popup_id = p_popup_id and id = any(p_section_ids);
  if v_matched <> v_total then
    raise exception 'reorder list must include every section on this popup exactly once';
  end if;

  foreach v_section_id in array p_section_ids loop
    update public.site_popup_sections set display_order = v_idx, updated_at = now() where id = v_section_id;
    v_idx := v_idx + 1;
  end loop;
end;
$function$;

create or replace function public.turn_on_service(p_service_id uuid, p_workspace_id uuid, p_new_name text default null::text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row jsonb;
  v_source_workspace_id uuid;
  v_new_id uuid := gen_random_uuid();
  v_new_slug text;
  v_source_process_id uuid;
  v_new_process_id uuid;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to turn on a service in this workspace';
  end if;
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  select to_jsonb(t) into v_row from public.services t where t.id = p_service_id;
  if v_row is null then
    raise exception 'service % not found', p_service_id;
  end if;

  v_source_workspace_id := nullif(v_row->>'workspace_id', '')::uuid;
  if v_source_workspace_id is not null and v_source_workspace_id <> p_workspace_id then
    raise exception 'cannot turn on another workspace''s service directly';
  end if;

  v_new_slug := coalesce(v_row->>'slug', 'service') || '-copy-' || left(replace(v_new_id::text, '-', ''), 8);

  v_row := v_row || jsonb_build_object(
    'id', v_new_id,
    'workspace_id', p_workspace_id,
    'slug', v_new_slug,
    'status', 'draft',
    'created_at', now(),
    'updated_at', now(),
    'cloned_from_service_id', p_service_id
  );
  if p_new_name is not null then
    v_row := v_row || jsonb_build_object('name', p_new_name);
  end if;

  insert into public.services select * from jsonb_populate_record(null::public.services, v_row);

  v_source_process_id := nullif(v_row->>'process_id', '')::uuid;
  if v_source_process_id is not null then
    v_new_process_id := gen_random_uuid();

    insert into public.processes (id, workspace_id, name, slug, description, status, created_by, created_at, updated_at)
    select v_new_process_id, p_workspace_id, name,
           slug || '-copy-' || left(replace(v_new_process_id::text, '-', ''), 8),
           description, 'draft', auth.uid(), now(), now()
    from public.processes where id = v_source_process_id;

    create temporary table if not exists tmp_turn_on_stage_map (old_id uuid primary key, new_id uuid) on commit drop;
    delete from tmp_turn_on_stage_map where true;

    insert into tmp_turn_on_stage_map (old_id, new_id)
    select id, gen_random_uuid() from public.process_stages where process_id = v_source_process_id;

    insert into public.process_stages (id, process_id, name, display_order, reviewer_role_id, completion_rule, due_date_rule, entry_conditions, notify_on_entry, expected_duration, warning_threshold, critical_threshold)
    select m.new_id, v_new_process_id, s.name, s.display_order, s.reviewer_role_id, s.completion_rule, s.due_date_rule, s.entry_conditions, s.notify_on_entry, s.expected_duration, s.warning_threshold, s.critical_threshold
    from public.process_stages s
    join tmp_turn_on_stage_map m on m.old_id = s.id
    where s.process_id = v_source_process_id;

    insert into public.process_tasks (id, process_stage_id, name, description, display_order, assignee_role_id, is_required, due_date_rule, automation_trigger)
    select gen_random_uuid(), m.new_id, t.name, t.description, t.display_order, t.assignee_role_id, t.is_required, t.due_date_rule, t.automation_trigger
    from public.process_tasks t
    join tmp_turn_on_stage_map m on m.old_id = t.process_stage_id;

    update public.services set process_id = v_new_process_id where id = v_new_id;
  end if;

  return v_new_id;
end;
$function$;
