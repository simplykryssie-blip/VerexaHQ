drop function public.duplicate_config_object(text, uuid, text);

create or replace function public.duplicate_config_object(
  p_table text,
  p_id uuid,
  p_target_workspace_id uuid default null,
  p_new_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_source_workspace_id uuid;
  v_dest_workspace_id uuid;
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

  v_source_workspace_id := nullif(v_row->>'workspace_id', '')::uuid;
  v_dest_workspace_id := coalesce(p_target_workspace_id, v_source_workspace_id);

  if v_dest_workspace_id is null then
    raise exception 'a target workspace is required to duplicate a Verexa system object';
  end if;
  if not public.is_workspace_admin(v_dest_workspace_id) then
    raise exception 'insufficient permissions to duplicate into this workspace';
  end if;
  if v_source_workspace_id is not null and v_source_workspace_id <> v_dest_workspace_id then
    raise exception 'cannot duplicate another workspace''s object';
  end if;

  v_new_slug := coalesce(v_row->>'slug', 'item') || '-copy-' || left(replace(v_new_id::text, '-', ''), 8);

  v_row := (v_row - 'id' - 'created_at' - 'updated_at')
    || jsonb_build_object('id', v_new_id, 'workspace_id', v_dest_workspace_id, 'slug', v_new_slug, 'status', 'draft');
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
comment on function public.duplicate_config_object(text, uuid, uuid, text) is 'Deep-copies a top-level configuration object into p_target_workspace_id (required when the source is a Verexa system object).';

revoke execute on function public.duplicate_config_object(text, uuid, uuid, text) from public;
grant execute on function public.duplicate_config_object(text, uuid, uuid, text) to authenticated;

create or replace function public.apply_blueprint(
  p_blueprint_id uuid,
  p_workspace_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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

  return v_new_blueprint_id;
end;
$$;
comment on function public.apply_blueprint(uuid, uuid) is 'Deep-copies an entire blueprint (all its components) into a workspace and rewires the copied services'' cross-references to the copies.';

revoke execute on function public.apply_blueprint(uuid, uuid) from public;
grant execute on function public.apply_blueprint(uuid, uuid) to authenticated;

create table public.case_shares (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  shared_with_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  shared_items jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  decision_notes text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  shared_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (workspace_id <> shared_with_workspace_id)
);
comment on table public.case_shares is 'A PTIN''s Case shared with one connected ERO for review. shared_items = {"organizer","documents","notes","messages","billing","prior_year_returns"} booleans. The PTIN always owns the Case; the share is a temporary, revocable grant, not a transfer.';
comment on column public.case_shares.case_id is 'References the future public.jobs/cases table (Phase 3). No FK yet -- that table doesn''t exist.';

create index case_shares_case_idx on public.case_shares (case_id);
create index case_shares_workspace_idx on public.case_shares (workspace_id, status);
create index case_shares_shared_with_idx on public.case_shares (shared_with_workspace_id, status);

create trigger set_updated_at before update on public.case_shares for each row execute function public.set_updated_at();
create trigger audit_case_shares after insert or update or delete on public.case_shares for each row execute function public.audit_trigger_fn();

alter table public.case_shares enable row level security;

create policy case_shares_select on public.case_shares
  for select using (
    public.is_workspace_member(workspace_id) or public.is_workspace_member(shared_with_workspace_id)
  );

create or replace function public.share_case_with_ero(
  p_case_id uuid,
  p_workspace_id uuid,
  p_shared_with_workspace_id uuid,
  p_shared_items jsonb default '{}'::jsonb,
  p_expires_in_days integer default 30
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'insufficient permissions to share a case from this workspace';
  end if;
  if not exists (
    select 1 from public.firm_connections
    where relationship_type = 'ero_ptin' and status = 'active'
      and child_workspace_id = p_workspace_id and parent_workspace_id = p_shared_with_workspace_id
  ) then
    raise exception 'no active ERO connection to share this case with';
  end if;

  insert into public.case_shares (case_id, workspace_id, shared_with_workspace_id, shared_items, shared_by, expires_at)
  values (p_case_id, p_workspace_id, p_shared_with_workspace_id, coalesce(p_shared_items, '{}'::jsonb), auth.uid(), now() + make_interval(days => p_expires_in_days))
  returning id into v_id;

  return v_id;
end;
$$;
comment on function public.share_case_with_ero(uuid, uuid, uuid, jsonb, integer) is 'A PTIN shares one Case with a connected ERO, choosing exactly what to expose.';

revoke execute on function public.share_case_with_ero(uuid, uuid, uuid, jsonb, integer) from public;
grant execute on function public.share_case_with_ero(uuid, uuid, uuid, jsonb, integer) to authenticated;

create or replace function public.respond_to_case_share(
  p_case_share_id uuid,
  p_approve boolean,
  p_decision_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ero_workspace_id uuid;
begin
  select shared_with_workspace_id into v_ero_workspace_id from public.case_shares where id = p_case_share_id;
  if v_ero_workspace_id is null then
    raise exception 'case share not found';
  end if;
  if not public.is_workspace_member(v_ero_workspace_id) then
    raise exception 'insufficient permissions to respond to this case share';
  end if;

  update public.case_shares set
    status = case when p_approve then 'approved' else 'rejected' end,
    decision_notes = p_decision_notes,
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = p_case_share_id;
end;
$$;
comment on function public.respond_to_case_share(uuid, boolean, text) is 'The connected ERO reviews a shared Case: approve, comment via decision_notes, or reject/request corrections.';

revoke execute on function public.respond_to_case_share(uuid, boolean, text) from public;
grant execute on function public.respond_to_case_share(uuid, boolean, text) to authenticated;

create or replace function public.expire_stale_case_shares()
returns integer
language sql
security definer
set search_path = public
as $$
  with expired as (
    update public.case_shares
    set status = 'expired'
    where status = 'pending' and expires_at < now()
    returning id
  )
  select count(*)::integer from expired;
$$;
comment on function public.expire_stale_case_shares() is 'Maintenance sweep for a scheduled job (pg_cron, added in a later phase): marks past-due pending shares as expired.';

revoke execute on function public.expire_stale_case_shares() from public, anon, authenticated;
