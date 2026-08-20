-- Retires the old flat lead_stages list entirely in favor of the real
-- Pipelines system (lead_pipeline_runs/lead_pipeline_stages), per explicit
-- user direction: "Retire the old flat list, use real Pipelines
-- everywhere." Three consumers depended on lead_stages:
--   1. validate_client_lifecycle_status -- allowed a lead's lifecycle_status
--      to be a lead_stages.key as well as active/inactive/archived/lost.
--      'lead' itself only passed validation because every workspace's
--      lead_stages seed happened to include a 'lead' row -- so 'lead' must
--      be hardcoded into the allowed list BEFORE lead_stages can be
--      dropped, or every new client creation would start failing.
--   2. fire_lead_assigned_automations / fire_lead_updated_automations --
--      fell back to checking lead_stages when lifecycle_status wasn't
--      exactly 'lead'. Nothing will ever set lifecycle_status to a
--      lead_stages key going forward, so the fallback is now dead weight.
--   3. The Leads tab filter chips + LeadStageControl (removed in this same
--      change, application-side) -- replaced by a Pipeline+Stage picker
--      backed by lead_pipeline_runs/lead_pipeline_stages, the same system
--      "Move the lead to a pipeline stage" and "A lead enters a pipeline
--      stage" already use.

create or replace function public.validate_client_lifecycle_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.lifecycle_status in ('lead', 'active', 'inactive', 'archived', 'lost') then
    return new;
  end if;
  raise exception 'Invalid lifecycle_status "%" for this workspace.', new.lifecycle_status;
end;
$function$;

create or replace function public.fire_lead_assigned_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
begin
  if new.relationship_manager_id is not distinct from old.relationship_manager_id then
    return new;
  end if;
  if new.lifecycle_status <> 'lead' then
    return new;
  end if;

  v_context := jsonb_build_object('assigned_staff_id', new.relationship_manager_id);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'lead.assigned'
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, new.id, null) then
      insert into public.automation_runs (workspace_id, automation_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

create or replace function public.fire_lead_updated_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
begin
  if old.lifecycle_status <> 'lead' then
    return new;
  end if;

  v_context := jsonb_build_object('lifecycle_status', new.lifecycle_status);

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and trigger_type = 'lead.updated'
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, new.id, null) then
      insert into public.automation_runs (workspace_id, automation_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

-- Which pipeline a brand-new lead should be dropped onto, so the Leads tab
-- has something to show without staff manually starting a run first.
alter table public.workspaces add column if not exists default_lead_process_id uuid references public.processes(id) on delete set null;

create or replace function public.auto_start_lead_pipeline_on_create()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_process_id uuid;
begin
  if new.lifecycle_status <> 'lead' then
    return new;
  end if;

  select default_lead_process_id into v_process_id from public.workspaces where id = new.workspace_id;
  if v_process_id is null then
    return new;
  end if;

  perform public.start_lead_pipeline_run(new.id, v_process_id);
  return new;
end;
$function$;

create trigger trg_auto_start_lead_pipeline_on_create
  after insert on public.clients
  for each row execute function public.auto_start_lead_pipeline_on_create();

-- Manual staff control on a lead's profile page -- mirrors the
-- move_lead_stage automation action's semantics (start a run if none
-- exists, forward-only advance) but permission-checked for direct calls
-- instead of only ever running inside the automation engine.
create or replace function public.advance_lead_pipeline_stage(p_client_id uuid, p_process_id uuid, p_process_stage_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_lead_run_id uuid;
  v_lead_run_process_id uuid;
  v_lead_stage_id uuid;
  v_target_stage_id uuid;
  v_target_order int;
  v_current_order int;
  v_loop_guard int;
begin
  select workspace_id into v_workspace_id from public.clients where id = p_client_id;
  if v_workspace_id is null then
    raise exception 'Client not found';
  end if;
  if not public.has_permission(v_workspace_id, 'clients.edit') then
    raise exception 'Not authorized';
  end if;

  select id, process_id, current_stage_id into v_lead_run_id, v_lead_run_process_id, v_lead_stage_id
  from public.lead_pipeline_runs
  where client_id = p_client_id and status = 'Active';

  if v_lead_run_id is null then
    v_lead_run_id := public.start_lead_pipeline_run(p_client_id, p_process_id);
    select current_stage_id into v_lead_stage_id from public.lead_pipeline_runs where id = v_lead_run_id;
  elsif v_lead_run_process_id is distinct from p_process_id then
    raise exception 'This lead is already in a different pipeline';
  end if;

  select id into v_target_stage_id from public.lead_pipeline_stages
  where lead_pipeline_run_id = v_lead_run_id and process_stage_id = p_process_stage_id;

  if v_target_stage_id is null then
    raise exception 'Target stage is not part of this lead''s pipeline';
  end if;

  select display_order into v_target_order from public.lead_pipeline_stages where id = v_target_stage_id;
  select display_order into v_current_order from public.lead_pipeline_stages where id = v_lead_stage_id;

  if v_target_order < v_current_order then
    raise exception 'Moving a lead backward through pipeline stages is not supported';
  end if;

  v_loop_guard := 0;
  while v_lead_stage_id is distinct from v_target_stage_id and v_loop_guard < 100 loop
    update public.lead_pipeline_stages set status = 'Completed', completed_at = now() where id = v_lead_stage_id;
    select current_stage_id into v_lead_stage_id from public.lead_pipeline_runs where id = v_lead_run_id;
    v_loop_guard := v_loop_guard + 1;
  end loop;
end;
$function$;

revoke all on function public.advance_lead_pipeline_stage(uuid, uuid, uuid) from public, anon;
grant execute on function public.advance_lead_pipeline_stage(uuid, uuid, uuid) to authenticated;

-- fire_lead_status_changed_automations (fixed for evaluate_automation_conditions
-- arity in a prior migration this session) still has a lead_stages EXISTS
-- fallback in v_was_lead_pipeline -- dead now that lifecycle_status will
-- never be a lead_stages key.
create or replace function public.fire_lead_status_changed_automations()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_automation record;
  v_context jsonb;
  v_run_id uuid;
  v_was_lead_pipeline boolean;
begin
  if new.lifecycle_status is not distinct from old.lifecycle_status then
    return new;
  end if;

  v_context := jsonb_build_object('to_status', new.lifecycle_status, 'from_status', old.lifecycle_status);
  v_was_lead_pipeline := old.lifecycle_status = 'lead';

  for v_automation in
    select * from public.automations
    where workspace_id = new.workspace_id and is_enabled = true and status = 'published'
      and (
        (trigger_type = 'lead.status_changed' and trigger_config ->> 'to_status' = new.lifecycle_status)
        or (v_was_lead_pipeline and new.lifecycle_status = 'active' and trigger_type = 'lead.converted_to_client')
        or (new.lifecycle_status = 'lost' and trigger_type = 'lead.marked_lost')
      )
  loop
    if public.evaluate_automation_conditions(v_automation.conditions, v_context, new.workspace_id, new.id, null) then
      insert into public.automation_runs (workspace_id, automation_id, client_id, trigger_snapshot, status)
      values (new.workspace_id, v_automation.id, new.id, v_context, 'running')
      returning id into v_run_id;
      perform public.start_next_automation_step(v_run_id);
    end if;
  end loop;

  return new;
end;
$function$;

-- create_workspace seeded every new workspace with the same 3 lead_stages
-- rows on signup -- that seed goes away with the table.
create or replace function public.create_workspace(p_name text, p_workspace_type text default 'independent_ptin'::text, p_timezone text default 'America/New_York'::text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_id uuid;
  v_owner_role_id uuid;
  v_slug text;
  v_suffix int := 0;
begin
  if auth.uid() is null then
    raise exception 'create_workspace requires an authenticated user';
  end if;

  if exists (select 1 from public.client_portal_users where user_id = auth.uid() and status = 'active') then
    raise exception 'this account is a client portal account and cannot create a staff workspace';
  end if;

  select id into v_owner_role_id from public.roles where workspace_id is null and slug = 'owner';
  if v_owner_role_id is null then
    raise exception 'system owner role is not seeded';
  end if;

  v_slug := regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g');
  v_slug := regexp_replace(v_slug, '(^-+|-+$)', '', 'g');
  if v_slug = '' then
    v_slug := 'workspace';
  end if;
  while exists (select 1 from public.workspaces where slug = v_slug || case when v_suffix = 0 then '' else '-' || v_suffix end) loop
    v_suffix := v_suffix + 1;
  end loop;
  if v_suffix > 0 then
    v_slug := v_slug || '-' || v_suffix;
  end if;

  insert into public.workspaces (name, slug, workspace_type, timezone, created_by, primary_contact_email)
  values (p_name, v_slug, p_workspace_type, p_timezone, auth.uid(), (select email from auth.users where id = auth.uid()))
  returning id into v_workspace_id;

  insert into public.workspace_users (workspace_id, user_id, role_id, is_owner, status, joined_at)
  values (v_workspace_id, auth.uid(), v_owner_role_id, true, 'active', now());

  insert into public.branding (workspace_id, display_name)
  values (v_workspace_id, p_name);

  insert into public.workspace_feature_flags (workspace_id, feature_flag_id, is_enabled)
  select v_workspace_id, id, true from public.feature_flags where is_core;

  perform public.copy_preloaded_templates_to_workspace(v_workspace_id);

  update public.user_profiles set default_workspace_id = v_workspace_id
  where id = auth.uid() and default_workspace_id is null;

  return v_workspace_id;
end;
$function$;

-- Every consumer has been rewired off of lead_stages (application code in
-- this same change; DB functions above). Safe to drop.
drop table public.lead_stages;
