-- Pipelines (processes/process_stages/process_tasks) were gated on
-- is_workspace_admin (owner/admin role only) instead of a granted
-- permission like every other configurable resource in the app
-- (automations.manage, templates.manage, services.manage, ...). A
-- staff/ero/manager user -- who can already build and edit workflows via
-- automations.manage -- saw the same "+ New pipeline" button and rename
-- pencil an admin would, but every write silently failed with
-- "insufficient permissions...". Adds pipelines.manage, granted to the
-- same roles as automations.manage, and switches every pipeline write
-- path (RLS + the two pipeline RPCs) from is_workspace_admin to
-- has_permission.

insert into public.permissions (key, category, description)
values ('pipelines.manage', 'pipelines', 'Create, edit, and delete pipelines and their stages/tasks');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null
  and r.slug in ('owner', 'admin', 'ero', 'manager', 'staff')
  and p.key = 'pipelines.manage';

drop policy processes_insert on public.processes;
create policy processes_insert on public.processes
  for insert with check (workspace_id is not null and has_permission(workspace_id, 'pipelines.manage'));

drop policy processes_update on public.processes;
create policy processes_update on public.processes
  for update using (workspace_id is not null and has_permission(workspace_id, 'pipelines.manage'));

drop policy processes_delete on public.processes;
create policy processes_delete on public.processes
  for delete using (workspace_id is not null and has_permission(workspace_id, 'pipelines.manage'));

drop policy process_stages_insert on public.process_stages;
create policy process_stages_insert on public.process_stages
  for insert with check (
    exists (select 1 from public.processes p where p.id = process_stages.process_id and p.workspace_id is not null and has_permission(p.workspace_id, 'pipelines.manage'))
  );

drop policy process_stages_update on public.process_stages;
create policy process_stages_update on public.process_stages
  for update using (
    exists (select 1 from public.processes p where p.id = process_stages.process_id and p.workspace_id is not null and has_permission(p.workspace_id, 'pipelines.manage'))
  );

drop policy process_stages_delete on public.process_stages;
create policy process_stages_delete on public.process_stages
  for delete using (
    exists (select 1 from public.processes p where p.id = process_stages.process_id and p.workspace_id is not null and has_permission(p.workspace_id, 'pipelines.manage'))
  );

drop policy process_tasks_insert on public.process_tasks;
create policy process_tasks_insert on public.process_tasks
  for insert with check (
    exists (
      select 1 from public.process_stages ps join public.processes p on p.id = ps.process_id
      where ps.id = process_tasks.process_stage_id and p.workspace_id is not null and has_permission(p.workspace_id, 'pipelines.manage')
    )
  );

drop policy process_tasks_update on public.process_tasks;
create policy process_tasks_update on public.process_tasks
  for update using (
    exists (
      select 1 from public.process_stages ps join public.processes p on p.id = ps.process_id
      where ps.id = process_tasks.process_stage_id and p.workspace_id is not null and has_permission(p.workspace_id, 'pipelines.manage')
    )
  );

drop policy process_tasks_delete on public.process_tasks;
create policy process_tasks_delete on public.process_tasks
  for delete using (
    exists (
      select 1 from public.process_stages ps join public.processes p on p.id = ps.process_id
      where ps.id = process_tasks.process_stage_id and p.workspace_id is not null and has_permission(p.workspace_id, 'pipelines.manage')
    )
  );

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
  if not has_permission(v_process.workspace_id, 'pipelines.manage') then
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
