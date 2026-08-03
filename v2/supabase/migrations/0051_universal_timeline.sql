-- Epic 3A: Engagement Foundation -- Part 4 (Universal Timeline).
--
-- No new table: activity_log (Phase 0) already has exactly the shape the
-- spec asks for -- workspace_id, actor_id (User), created_at (Timestamp),
-- event_type/activity_type (Event Type), description (Description),
-- entity_type/entity_id (Linked Entity). The drifted audit_workflow_event()
-- trigger already proved this pattern works for workflow status changes.
-- This migration is just wiring more of "every module writes to it": an
-- engagement being created, its status changing, a task being completed, a
-- file being attached, an automation executing, and a blueprint being
-- applied.

create or replace function public.record_engagement_created()
returns trigger
language plpgsql
as $$
begin
  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (
    new.workspace_id, (select auth.uid()), 'engagement', new.id, 'ENGAGEMENT_CREATED', 'ENGAGEMENT_CREATED',
    'Engagement ' || new.engagement_number || ' was created',
    jsonb_build_object('engagement_number', new.engagement_number, 'client_id', new.client_id)
  );
  return new;
end;
$$;

create trigger record_engagement_created after insert on public.engagements
for each row execute function public.record_engagement_created();

-- Extend the Status Engine trigger from 0050 to also post to the Timeline
-- (identical logic otherwise -- CREATE OR REPLACE, not a new trigger).
create or replace function public.record_engagement_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.engagement_status_history (engagement_id, old_status, new_status, changed_by)
    values (new.id, old.status, new.status, (select auth.uid()));

    insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
    values (
      new.workspace_id, (select auth.uid()), 'engagement', new.id, 'STATUS_CHANGE', 'STATUS_CHANGE',
      'Engagement ' || new.engagement_number || ' status changed from ' || coalesce(old.status, 'NULL') || ' to ' || new.status,
      jsonb_build_object('old_status', old.status, 'new_status', new.status)
    );

    if new.status = 'Completed' and new.completed_date is null then
      new.completed_date := now();
    end if;
    if new.status = 'Archived' and new.archived_date is null then
      new.archived_date := now();
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.record_task_completed()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
    values (
      new.workspace_id, (select auth.uid()), 'task', new.id, 'TASK_COMPLETED', 'TASK_COMPLETED',
      'Task "' || new.title || '" was completed',
      jsonb_build_object('engagement_id', new.engagement_id)
    );
  end if;
  return new;
end;
$$;

create trigger record_task_completed after update of status on public.tasks
for each row execute function public.record_task_completed();

create or replace function public.record_attachment_uploaded()
returns trigger
language plpgsql
as $$
begin
  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (
    new.workspace_id, (select auth.uid()), new.entity_type, new.entity_id, 'DOCUMENT_UPLOADED', 'DOCUMENT_UPLOADED',
    'Document "' || new.file_name || '" was uploaded',
    jsonb_build_object('attachment_id', new.id, 'entity_type', new.entity_type)
  );
  return new;
end;
$$;

create trigger record_attachment_uploaded after insert on public.attachments
for each row execute function public.record_attachment_uploaded();

-- automation_execution_logs has no authenticated insert policy (system/
-- SECURITY DEFINER writer only, same as audit_log) -- this mirror trigger
-- must bypass RLS the same way, since it may run with no user session at
-- all (a scheduled automation, not a live request).
create or replace function public.record_automation_executed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.engagement_id is not null then
    insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
    values (
      new.workspace_id, (select auth.uid()), 'engagement', new.engagement_id, 'AUTOMATION_EXECUTED', 'AUTOMATION_EXECUTED',
      'An automation executed with status ' || new.status,
      jsonb_build_object('automation_id', new.automation_id, 'status', new.status)
    );
  end if;
  return new;
end;
$$;

create trigger record_automation_executed after insert on public.automation_execution_logs
for each row execute function public.record_automation_executed();

-- Blueprint applied: one line added to the existing (Phase 2) apply_blueprint,
-- otherwise byte-for-byte unchanged.
create or replace function public.apply_blueprint(p_blueprint_id uuid, p_workspace_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_source_workspace_id uuid;
  v_new_blueprint_id uuid := gen_random_uuid();
  v_blueprint_name text;
  v_blueprint_slug text;
  v_blueprint_description text;
  v_blueprint_category text;
  v_component record;
  v_new_component_id uuid;
  v_service record;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to apply a blueprint to this workspace';
  end if;

  select workspace_id, name, slug, description, category
    into v_source_workspace_id, v_blueprint_name, v_blueprint_slug, v_blueprint_description, v_blueprint_category
  from public.blueprints where id = p_blueprint_id;

  if v_blueprint_name is null then
    raise exception 'blueprint % not found', p_blueprint_id;
  end if;
  if v_source_workspace_id is not null and v_source_workspace_id <> p_workspace_id then
    raise exception 'cannot apply another workspace''s blueprint';
  end if;

  create temporary table if not exists tmp_blueprint_id_map (
    component_type text, old_id uuid, new_id uuid, primary key (component_type, old_id)
  ) on commit drop;
  delete from tmp_blueprint_id_map;

  insert into public.blueprints (id, workspace_id, name, slug, description, category, source_blueprint_id, status, created_by)
  values (
    v_new_blueprint_id, p_workspace_id, v_blueprint_name,
    v_blueprint_slug || '-' || left(replace(v_new_blueprint_id::text, '-', ''), 8),
    v_blueprint_description, v_blueprint_category, p_blueprint_id, 'published', auth.uid()
  );

  for v_component in
    select component_type, component_id, is_primary
    from public.blueprint_components
    where blueprint_id = p_blueprint_id
  loop
    v_new_component_id := public.duplicate_config_object(v_component.component_type, v_component.component_id, p_workspace_id, null);

    insert into public.blueprint_components (blueprint_id, component_type, component_id, is_primary)
    values (v_new_blueprint_id, v_component.component_type, v_new_component_id, v_component.is_primary);

    insert into tmp_blueprint_id_map (component_type, old_id, new_id)
    values (v_component.component_type, v_component.component_id, v_new_component_id);
  end loop;

  for v_service in
    select old_id as old_service_id, new_id as new_service_id
    from tmp_blueprint_id_map
    where component_type = 'services'
  loop
    update public.services s set
      service_category_id = coalesce((select new_id from tmp_blueprint_id_map where component_type = 'service_categories' and old_id = orig.service_category_id), s.service_category_id),
      process_id = coalesce((select new_id from tmp_blueprint_id_map where component_type = 'processes' and old_id = orig.process_id), s.process_id),
      pipeline_id = coalesce((select new_id from tmp_blueprint_id_map where component_type = 'pipelines' and old_id = orig.pipeline_id), s.pipeline_id),
      organizer_template_id = coalesce((select new_id from tmp_blueprint_id_map where component_type = 'organizer_templates' and old_id = orig.organizer_template_id), s.organizer_template_id),
      document_request_template_id = coalesce((select new_id from tmp_blueprint_id_map where component_type = 'document_request_templates' and old_id = orig.document_request_template_id), s.document_request_template_id),
      engagement_letter_template_id = coalesce((select new_id from tmp_blueprint_id_map where component_type = 'engagement_letter_templates' and old_id = orig.engagement_letter_template_id), s.engagement_letter_template_id),
      pricing_rule_id = coalesce((select new_id from tmp_blueprint_id_map where component_type = 'pricing_rules' and old_id = orig.pricing_rule_id), s.pricing_rule_id),
      billing_rule_id = coalesce((select new_id from tmp_blueprint_id_map where component_type = 'billing_rules' and old_id = orig.billing_rule_id), s.billing_rule_id)
    from public.services orig
    where orig.id = v_service.old_service_id
      and s.id = v_service.new_service_id;
  end loop;

  insert into public.activity_log (workspace_id, actor_id, entity_type, entity_id, activity_type, event_type, description, metadata)
  values (
    p_workspace_id, auth.uid(), 'blueprint', v_new_blueprint_id, 'BLUEPRINT_APPLIED', 'BLUEPRINT_APPLIED',
    'Blueprint "' || v_blueprint_name || '" was applied',
    jsonb_build_object('source_blueprint_id', p_blueprint_id)
  );

  return v_new_blueprint_id;
end;
$function$;
