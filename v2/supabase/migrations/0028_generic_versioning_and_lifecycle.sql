-- Phase 2: Firm Configuration Engine -- Generic Preview/Duplicate/Publish/
-- Archive/Version History system.
--
-- Every configuration object (service, process, pipeline, organizer
-- template, document request template, engagement letter template, email
-- template, SMS template, pricing rule, billing rule, automation,
-- dashboard, blueprint) shares the same lifecycle: draft/published/archived
-- status, duplicate-to-copy, and full version history with compare. Rather
-- than writing the same duplicate/publish/archive/version logic thirteen
-- times, one generic, allowlisted set of functions drives all of them.

-- blueprint_components.component_type was seeded with singular labels;
-- switch to the real (plural) table names so every part of the system
-- (versioning, generic RPCs, blueprint components) speaks the same
-- vocabulary.
alter table public.blueprint_components drop constraint blueprint_components_component_type_check;
alter table public.blueprint_components add constraint blueprint_components_component_type_check
  check (component_type in (
    'service_categories', 'services', 'processes', 'pipelines', 'organizer_templates',
    'document_request_templates', 'engagement_letter_templates', 'email_templates',
    'sms_templates', 'pricing_rules', 'billing_rules', 'automations', 'dashboards'
  ));

create or replace function public.is_valid_config_table(p_table text)
returns boolean
language sql
immutable
as $$
  select p_table = any(array[
    'service_categories', 'services', 'processes', 'pipelines', 'organizer_templates',
    'document_request_templates', 'engagement_letter_templates', 'email_templates',
    'sms_templates', 'pricing_rules', 'billing_rules', 'automations', 'dashboards', 'blueprints'
  ]);
$$;
comment on function public.is_valid_config_table(text) is 'Allowlist of top-level, publishable configuration tables the generic lifecycle/versioning RPCs may touch.';

-- ============================================================================
-- config_object_versions: append-only snapshot history for every top-level
-- configuration object, keyed by (object_type = table name, object_id).
-- ============================================================================
create table public.config_object_versions (
  id uuid primary key default gen_random_uuid(),
  object_type text not null check (public.is_valid_config_table(object_type)),
  object_id uuid not null,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  version_number integer not null,
  snapshot jsonb not null,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (object_type, object_id, version_number)
);
comment on table public.config_object_versions is 'Full-row snapshot taken before every UPDATE to a top-level configuration object, giving Version History + Compare Versions for free.';

create index config_object_versions_lookup_idx on public.config_object_versions (object_type, object_id, version_number desc);
create index config_object_versions_workspace_idx on public.config_object_versions (workspace_id);

alter table public.config_object_versions enable row level security;

create policy config_object_versions_select on public.config_object_versions
  for select using (workspace_id is null or public.is_workspace_member(workspace_id));

-- ============================================================================
-- snapshot_config_version: generic BEFORE UPDATE trigger, attached to every
-- top-level configuration table. Snapshots the pre-update row.
-- ============================================================================
create or replace function public.snapshot_config_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_version integer;
begin
  select coalesce(max(version_number), 0) + 1 into v_next_version
  from public.config_object_versions
  where object_type = TG_TABLE_NAME and object_id = old.id;

  insert into public.config_object_versions (object_type, object_id, workspace_id, version_number, snapshot, changed_by)
  values (TG_TABLE_NAME, old.id, old.workspace_id, v_next_version, to_jsonb(old), auth.uid());

  return new;
end;
$$;
comment on function public.snapshot_config_version() is 'Generic version-history trigger for top-level configuration tables.';

revoke execute on function public.snapshot_config_version() from public, anon, authenticated;

create trigger snapshot_version before update on public.service_categories for each row execute function public.snapshot_config_version();
create trigger snapshot_version before update on public.services for each row execute function public.snapshot_config_version();
create trigger snapshot_version before update on public.processes for each row execute function public.snapshot_config_version();
create trigger snapshot_version before update on public.pipelines for each row execute function public.snapshot_config_version();
create trigger snapshot_version before update on public.organizer_templates for each row execute function public.snapshot_config_version();
create trigger snapshot_version before update on public.document_request_templates for each row execute function public.snapshot_config_version();
create trigger snapshot_version before update on public.engagement_letter_templates for each row execute function public.snapshot_config_version();
create trigger snapshot_version before update on public.email_templates for each row execute function public.snapshot_config_version();
create trigger snapshot_version before update on public.sms_templates for each row execute function public.snapshot_config_version();
create trigger snapshot_version before update on public.pricing_rules for each row execute function public.snapshot_config_version();
create trigger snapshot_version before update on public.billing_rules for each row execute function public.snapshot_config_version();
create trigger snapshot_version before update on public.automations for each row execute function public.snapshot_config_version();
create trigger snapshot_version before update on public.dashboards for each row execute function public.snapshot_config_version();
create trigger snapshot_version before update on public.blueprints for each row execute function public.snapshot_config_version();

-- ============================================================================
-- duplicate_config_object: deep-copies a top-level object plus its owned
-- children (stages/tasks, fields, items, steps, widgets, components) into a
-- fresh draft row. Duplicating a Verexa system object (workspace_id null)
-- copies it into the caller's own workspace; duplicating a workspace-owned
-- object stays in that workspace. Either way the caller must be an admin
-- of the destination workspace.
-- ============================================================================
create or replace function public.duplicate_config_object(
  p_table text,
  p_id uuid,
  p_new_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_workspace_id uuid;
  v_new_id uuid := gen_random_uuid();
  v_new_slug text;
begin
  if not public.is_valid_config_table(p_table) then
    raise exception 'unsupported config table: %', p_table;
  end if;

  execute format('select to_jsonb(t) from public.%I t where t.id = $1', p_table)
    into v_row using p_id;
  if v_row is null then
    raise exception '% % not found', p_table, p_id;
  end if;

  v_workspace_id := nullif(v_row->>'workspace_id', '')::uuid;
  if v_workspace_id is not null and not public.is_workspace_admin(v_workspace_id) then
    raise exception 'insufficient permissions to duplicate this object';
  end if;

  v_new_slug := coalesce(v_row->>'slug', 'item') || '-copy-' || left(replace(v_new_id::text, '-', ''), 8);

  v_row := (v_row - 'id' - 'created_at' - 'updated_at')
    || jsonb_build_object('id', v_new_id, 'slug', v_new_slug, 'status', 'draft');
  if p_new_name is not null then
    v_row := v_row || jsonb_build_object('name', p_new_name);
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

  elsif p_table = 'automations' then
    insert into public.automation_steps (id, automation_id, display_order, action_type, action_config, delay_minutes, requires_approval, approver_role_id)
    select gen_random_uuid(), v_new_id, display_order, action_type, action_config, delay_minutes, requires_approval, approver_role_id
    from public.automation_steps where automation_id = p_id;

  elsif p_table = 'dashboards' then
    insert into public.dashboard_widgets (id, dashboard_id, widget_type, title, display_order, grid_position, config)
    select gen_random_uuid(), v_new_id, widget_type, title, display_order, grid_position, config
    from public.dashboard_widgets where dashboard_id = p_id;

  elsif p_table = 'blueprints' then
    insert into public.blueprint_components (id, blueprint_id, component_type, component_id, is_primary)
    select gen_random_uuid(), v_new_id, component_type, component_id, is_primary
    from public.blueprint_components where blueprint_id = p_id;

  elsif p_table = 'organizer_templates' then
    create temporary table if not exists tmp_field_map (old_id uuid primary key, new_id uuid) on commit drop;
    delete from tmp_field_map;

    insert into tmp_field_map (old_id, new_id)
    select id, gen_random_uuid() from public.organizer_fields where organizer_template_id = p_id;

    insert into public.organizer_fields (id, organizer_template_id, parent_field_id, field_type, label, help_text, display_order, is_required, options, conditional_logic, validation)
    select m.new_id, v_new_id, pm.new_id, f.field_type, f.label, f.help_text, f.display_order, f.is_required, f.options, f.conditional_logic, f.validation
    from public.organizer_fields f
    join tmp_field_map m on m.old_id = f.id
    left join tmp_field_map pm on pm.old_id = f.parent_field_id
    where f.organizer_template_id = p_id;

  elsif p_table = 'processes' then
    create temporary table if not exists tmp_stage_map (old_id uuid primary key, new_id uuid) on commit drop;
    delete from tmp_stage_map;

    insert into tmp_stage_map (old_id, new_id)
    select id, gen_random_uuid() from public.process_stages where process_id = p_id;

    insert into public.process_stages (id, process_id, name, display_order, reviewer_role_id, completion_rule, due_date_rule, entry_conditions, notify_on_entry)
    select m.new_id, v_new_id, s.name, s.display_order, s.reviewer_role_id, s.completion_rule, s.due_date_rule, s.entry_conditions, s.notify_on_entry
    from public.process_stages s
    join tmp_stage_map m on m.old_id = s.id
    where s.process_id = p_id;

    insert into public.process_tasks (id, process_stage_id, name, description, display_order, assignee_role_id, is_required, due_date_rule, automation_trigger)
    select gen_random_uuid(), m.new_id, t.name, t.description, t.display_order, t.assignee_role_id, t.is_required, t.due_date_rule, t.automation_trigger
    from public.process_tasks t
    join tmp_stage_map m on m.old_id = t.process_stage_id;
  end if;

  return v_new_id;
end;
$$;
comment on function public.duplicate_config_object(text, uuid, text) is 'Deep-copies a top-level configuration object (and its owned children) into a new draft row.';

revoke execute on function public.duplicate_config_object(text, uuid, text) from public;
grant execute on function public.duplicate_config_object(text, uuid, text) to authenticated;

-- ============================================================================
-- set_config_object_status: publish/archive/restore-to-draft, generically.
-- ============================================================================
create or replace function public.set_config_object_status(
  p_table text,
  p_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  if not public.is_valid_config_table(p_table) then
    raise exception 'unsupported config table: %', p_table;
  end if;
  if p_status not in ('draft', 'published', 'archived') then
    raise exception 'invalid status: %', p_status;
  end if;

  execute format('select workspace_id from public.%I where id = $1', p_table) into v_workspace_id using p_id;

  if v_workspace_id is null then
    raise exception 'Verexa system objects are read-only; duplicate it into your workspace first';
  end if;
  if not public.is_workspace_admin(v_workspace_id) then
    raise exception 'insufficient permissions to change this object''s status';
  end if;

  execute format('update public.%I set status = $1 where id = $2', p_table) using p_status, p_id;
end;
$$;
comment on function public.set_config_object_status(text, uuid, text) is 'Publish, archive, or restore-to-draft any top-level configuration object.';

revoke execute on function public.set_config_object_status(text, uuid, text) from public;
grant execute on function public.set_config_object_status(text, uuid, text) to authenticated;

-- ============================================================================
-- get_config_object_versions / compare_config_object_versions
-- ============================================================================
create or replace function public.get_config_object_versions(p_table text, p_id uuid)
returns setof public.config_object_versions
language sql
stable
security definer
set search_path = public
as $$
  select v.*
  from public.config_object_versions v
  where v.object_type = p_table and v.object_id = p_id
    and (v.workspace_id is null or public.is_workspace_member(v.workspace_id))
  order by v.version_number desc;
$$;
comment on function public.get_config_object_versions(text, uuid) is 'Version history for a configuration object, newest first.';

revoke execute on function public.get_config_object_versions(text, uuid) from public;
grant execute on function public.get_config_object_versions(text, uuid) to authenticated;

create or replace function public.compare_config_object_versions(
  p_table text,
  p_id uuid,
  p_version_a integer,
  p_version_b integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a jsonb;
  v_b jsonb;
  v_workspace_id uuid;
  v_changed_keys text[];
begin
  select snapshot, workspace_id into v_a, v_workspace_id
  from public.config_object_versions where object_type = p_table and object_id = p_id and version_number = p_version_a;
  select snapshot into v_b
  from public.config_object_versions where object_type = p_table and object_id = p_id and version_number = p_version_b;

  if v_a is null or v_b is null then
    raise exception 'one or both versions not found for % %', p_table, p_id;
  end if;
  if v_workspace_id is not null and not public.is_workspace_member(v_workspace_id) then
    raise exception 'insufficient permissions to view these versions';
  end if;

  select array_agg(distinct k) into v_changed_keys
  from (
    select key as k from jsonb_each(v_a) where not jsonb_build_object(key, value) <@ v_b
    union
    select key as k from jsonb_each(v_b) where not jsonb_build_object(key, value) <@ v_a
  ) diffs;

  return jsonb_build_object(
    'version_a', jsonb_build_object('version_number', p_version_a, 'snapshot', v_a),
    'version_b', jsonb_build_object('version_number', p_version_b, 'snapshot', v_b),
    'changed_keys', to_jsonb(coalesce(v_changed_keys, array[]::text[]))
  );
end;
$$;
comment on function public.compare_config_object_versions(text, uuid, integer, integer) is 'Diffs two version snapshots of the same object, returning both plus the list of changed keys.';

revoke execute on function public.compare_config_object_versions(text, uuid, integer, integer) from public;
grant execute on function public.compare_config_object_versions(text, uuid, integer, integer) to authenticated;
