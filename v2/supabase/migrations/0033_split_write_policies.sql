-- Phase 2: Firm Configuration Engine -- Performance cleanup
-- Every child-table "_write" policy below used FOR ALL alongside a separate
-- "_select" policy, so SELECT queries evaluated two permissive policies
-- instead of one (the same pattern fixed for Phase 0 in migration 0011).
-- Split each into INSERT/UPDATE/DELETE only.

drop policy process_stages_write on public.process_stages;
create policy process_stages_insert on public.process_stages
  for insert with check (
    exists (select 1 from public.processes p where p.id = process_stages.process_id
      and p.workspace_id is not null and public.is_workspace_admin(p.workspace_id))
  );
create policy process_stages_update on public.process_stages
  for update using (
    exists (select 1 from public.processes p where p.id = process_stages.process_id
      and p.workspace_id is not null and public.is_workspace_admin(p.workspace_id))
  );
create policy process_stages_delete on public.process_stages
  for delete using (
    exists (select 1 from public.processes p where p.id = process_stages.process_id
      and p.workspace_id is not null and public.is_workspace_admin(p.workspace_id))
  );

drop policy process_tasks_write on public.process_tasks;
create policy process_tasks_insert on public.process_tasks
  for insert with check (
    exists (
      select 1 from public.process_stages ps join public.processes p on p.id = ps.process_id
      where ps.id = process_tasks.process_stage_id
        and p.workspace_id is not null and public.is_workspace_admin(p.workspace_id)
    )
  );
create policy process_tasks_update on public.process_tasks
  for update using (
    exists (
      select 1 from public.process_stages ps join public.processes p on p.id = ps.process_id
      where ps.id = process_tasks.process_stage_id
        and p.workspace_id is not null and public.is_workspace_admin(p.workspace_id)
    )
  );
create policy process_tasks_delete on public.process_tasks
  for delete using (
    exists (
      select 1 from public.process_stages ps join public.processes p on p.id = ps.process_id
      where ps.id = process_tasks.process_stage_id
        and p.workspace_id is not null and public.is_workspace_admin(p.workspace_id)
    )
  );

drop policy pipeline_stages_write on public.pipeline_stages;
create policy pipeline_stages_insert on public.pipeline_stages
  for insert with check (
    exists (select 1 from public.pipelines p where p.id = pipeline_stages.pipeline_id
      and p.workspace_id is not null and public.is_workspace_admin(p.workspace_id))
  );
create policy pipeline_stages_update on public.pipeline_stages
  for update using (
    exists (select 1 from public.pipelines p where p.id = pipeline_stages.pipeline_id
      and p.workspace_id is not null and public.is_workspace_admin(p.workspace_id))
  );
create policy pipeline_stages_delete on public.pipeline_stages
  for delete using (
    exists (select 1 from public.pipelines p where p.id = pipeline_stages.pipeline_id
      and p.workspace_id is not null and public.is_workspace_admin(p.workspace_id))
  );

drop policy organizer_fields_write on public.organizer_fields;
create policy organizer_fields_insert on public.organizer_fields
  for insert with check (
    exists (select 1 from public.organizer_templates t where t.id = organizer_fields.organizer_template_id
      and t.workspace_id is not null and public.is_workspace_admin(t.workspace_id))
  );
create policy organizer_fields_update on public.organizer_fields
  for update using (
    exists (select 1 from public.organizer_templates t where t.id = organizer_fields.organizer_template_id
      and t.workspace_id is not null and public.is_workspace_admin(t.workspace_id))
  );
create policy organizer_fields_delete on public.organizer_fields
  for delete using (
    exists (select 1 from public.organizer_templates t where t.id = organizer_fields.organizer_template_id
      and t.workspace_id is not null and public.is_workspace_admin(t.workspace_id))
  );

drop policy document_request_items_write on public.document_request_items;
create policy document_request_items_insert on public.document_request_items
  for insert with check (
    exists (select 1 from public.document_request_templates t where t.id = document_request_items.document_request_template_id
      and t.workspace_id is not null and public.is_workspace_admin(t.workspace_id))
  );
create policy document_request_items_update on public.document_request_items
  for update using (
    exists (select 1 from public.document_request_templates t where t.id = document_request_items.document_request_template_id
      and t.workspace_id is not null and public.is_workspace_admin(t.workspace_id))
  );
create policy document_request_items_delete on public.document_request_items
  for delete using (
    exists (select 1 from public.document_request_templates t where t.id = document_request_items.document_request_template_id
      and t.workspace_id is not null and public.is_workspace_admin(t.workspace_id))
  );

drop policy automation_steps_write on public.automation_steps;
create policy automation_steps_insert on public.automation_steps
  for insert with check (
    exists (select 1 from public.automations a where a.id = automation_steps.automation_id
      and a.workspace_id is not null and public.is_workspace_admin(a.workspace_id))
  );
create policy automation_steps_update on public.automation_steps
  for update using (
    exists (select 1 from public.automations a where a.id = automation_steps.automation_id
      and a.workspace_id is not null and public.is_workspace_admin(a.workspace_id))
  );
create policy automation_steps_delete on public.automation_steps
  for delete using (
    exists (select 1 from public.automations a where a.id = automation_steps.automation_id
      and a.workspace_id is not null and public.is_workspace_admin(a.workspace_id))
  );

drop policy dashboard_widgets_write on public.dashboard_widgets;
create policy dashboard_widgets_insert on public.dashboard_widgets
  for insert with check (
    exists (select 1 from public.dashboards d where d.id = dashboard_widgets.dashboard_id
      and d.workspace_id is not null and public.is_workspace_admin(d.workspace_id))
  );
create policy dashboard_widgets_update on public.dashboard_widgets
  for update using (
    exists (select 1 from public.dashboards d where d.id = dashboard_widgets.dashboard_id
      and d.workspace_id is not null and public.is_workspace_admin(d.workspace_id))
  );
create policy dashboard_widgets_delete on public.dashboard_widgets
  for delete using (
    exists (select 1 from public.dashboards d where d.id = dashboard_widgets.dashboard_id
      and d.workspace_id is not null and public.is_workspace_admin(d.workspace_id))
  );

drop policy blueprint_components_write on public.blueprint_components;
create policy blueprint_components_insert on public.blueprint_components
  for insert with check (
    exists (select 1 from public.blueprints b where b.id = blueprint_components.blueprint_id
      and b.workspace_id is not null and public.is_workspace_admin(b.workspace_id))
  );
create policy blueprint_components_update on public.blueprint_components
  for update using (
    exists (select 1 from public.blueprints b where b.id = blueprint_components.blueprint_id
      and b.workspace_id is not null and public.is_workspace_admin(b.workspace_id))
  );
create policy blueprint_components_delete on public.blueprint_components
  for delete using (
    exists (select 1 from public.blueprints b where b.id = blueprint_components.blueprint_id
      and b.workspace_id is not null and public.is_workspace_admin(b.workspace_id))
  );
