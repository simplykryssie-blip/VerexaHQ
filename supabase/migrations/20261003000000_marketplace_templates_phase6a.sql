-- =============================================================================
-- Phase 6A: Template Marketplace + Workspace Template Library
--
-- Two new tables only. Actual template CONTENT is never duplicated into a
-- separate schema -- a "master template" is just a normal organizer_templates
-- or automations row with workspace_id = null (the same "Verexa system
-- object" convention those two tables already support, see
-- is_valid_config_table/duplicate_config_object/set_config_object_status).
-- marketplace_templates is the thin catalog on top of that content
-- (eligibility, category, publish status, version). Installing/reinstalling/
-- duplicating a template reuses the existing duplicate_config_object() clone
-- engine verbatim -- it already remaps organizer_fields ids, conditional
-- logic, and automation_steps/edges ids correctly. Deleting an installed
-- template reuses the existing set_config_object_status() archive path.
-- =============================================================================

create table public.marketplace_templates (
  id uuid default gen_random_uuid() not null primary key,
  slug text not null unique,
  name text not null,
  description text,
  category text not null,
  source_table text not null,
  source_object_id uuid not null,
  eligible_workspace_types text[] not null default '{}',
  status text not null default 'draft',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_templates_source_table_check check (source_table in ('organizer_templates', 'automations')),
  constraint marketplace_templates_status_check check (status in ('draft', 'published', 'archived')),
  constraint marketplace_templates_version_check check (version > 0)
);

comment on table public.marketplace_templates is 'Verexa-owned master template catalog. Rows here are metadata only -- the actual template content lives in the referenced organizer_templates/automations row (workspace_id null on that row, same "Verexa system object" convention duplicate_config_object already understands). Writable only by a platform admin; see RLS.';

-- Workspace-owned copies. One row per install (fresh install, reinstall
-- after delete, or an explicit "duplicate" of an existing installed copy).
-- Deleting a workspace's copy never deletes this row -- it archives the
-- underlying organizer_templates/automations row instead (existing product
-- convention, see set_config_object_status), so installation history and
-- "already installed" checks stay accurate without resurrecting anything.
create table public.workspace_template_installations (
  id uuid default gen_random_uuid() not null primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  marketplace_template_id uuid not null references public.marketplace_templates(id) on delete restrict,
  source_table text not null,
  copy_object_id uuid not null,
  installed_version integer not null,
  installed_at timestamptz not null default now(),
  installed_by uuid references auth.users(id) on delete set null,
  constraint workspace_template_installations_source_table_check check (source_table in ('organizer_templates', 'automations'))
);

comment on table public.workspace_template_installations is 'Tracks which workspace-owned organizer_templates/automations row came from which Marketplace master, and at what master version, so "already installed"/"update available"/"My Templates" can be computed without touching the master.';

create index workspace_template_installations_workspace_idx on public.workspace_template_installations (workspace_id);
create index workspace_template_installations_marketplace_idx on public.workspace_template_installations (marketplace_template_id);
create index marketplace_templates_status_idx on public.marketplace_templates (status);

alter table public.marketplace_templates enable row level security;
alter table public.workspace_template_installations enable row level security;

-- Master catalog: readable by any signed-in user once published (it's a
-- product catalog, not workspace data -- see 5. DATABASE DESIGN: "do not
-- store sensitive client information inside... master template records", so
-- nothing here needs workspace scoping). Never writable by a workspace, only
-- a platform admin -- this is the enforcement that a workspace can never
-- edit/delete/alter a master, even via direct table access bypassing the
-- RPCs below.
create policy marketplace_templates_select on public.marketplace_templates
  for select to public
  using (status = 'published' or public.is_platform_admin());

create policy marketplace_templates_insert on public.marketplace_templates
  for insert to public
  with check (public.is_platform_admin());

create policy marketplace_templates_update on public.marketplace_templates
  for update to public
  using (public.is_platform_admin());

create policy marketplace_templates_delete on public.marketplace_templates
  for delete to public
  using (public.is_platform_admin());

-- Same select/mutate split as organizer_templates: any workspace member can
-- see what's installed, only an admin can install/duplicate/delete/disable.
-- All actual mutations go through the SECURITY DEFINER RPCs below (which
-- re-verify is_workspace_admin themselves against the real session, never
-- trusting the workspace_id argument alone) -- these policies are
-- defense-in-depth for any direct table access.
create policy workspace_template_installations_select on public.workspace_template_installations
  for select to public
  using (public.is_workspace_member(workspace_id));

create policy workspace_template_installations_insert on public.workspace_template_installations
  for insert to public
  with check (public.is_workspace_admin(workspace_id));

create policy workspace_template_installations_update on public.workspace_template_installations
  for update to public
  using (public.is_workspace_admin(workspace_id));

create policy workspace_template_installations_delete on public.workspace_template_installations
  for delete to public
  using (public.is_workspace_admin(workspace_id));

-- =============================================================================
-- RPCs
-- =============================================================================

-- Marketplace listing: eligibility is enforced HERE (server-side), not just
-- by hiding UI -- an ineligible workspace_type never gets a row back, and the
-- browser never has a way to ask for a different workspace_id's view (the
-- workspace_id is validated against auth.uid() via is_workspace_admin).
create or replace function public.list_marketplace_templates(p_workspace_id uuid)
returns table (
  id uuid,
  slug text,
  name text,
  description text,
  category text,
  source_table text,
  version integer,
  is_installed boolean,
  installation_id uuid,
  update_available boolean
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_workspace_type text;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to view the marketplace for this workspace';
  end if;

  select w.workspace_type into v_workspace_type from public.workspaces w where w.id = p_workspace_id;
  if v_workspace_type is null then
    raise exception 'workspace not found';
  end if;

  return query
  select
    mt.id, mt.slug, mt.name, mt.description, mt.category, mt.source_table, mt.version,
    (wti.id is not null) as is_installed,
    wti.id as installation_id,
    (wti.id is not null and wti.installed_version < mt.version) as update_available
  from public.marketplace_templates mt
  left join lateral (
    select wti2.id, wti2.installed_version
    from public.workspace_template_installations wti2
    where wti2.workspace_id = p_workspace_id
      and wti2.marketplace_template_id = mt.id
      and (
        (wti2.source_table = 'organizer_templates' and exists (select 1 from public.organizer_templates ot where ot.id = wti2.copy_object_id and ot.status <> 'archived'))
        or
        (wti2.source_table = 'automations' and exists (select 1 from public.automations a where a.id = wti2.copy_object_id and a.status <> 'archived'))
      )
    order by wti2.installed_at desc
    limit 1
  ) wti on true
  where mt.status = 'published'
    and v_workspace_type = any(mt.eligible_workspace_types)
  order by mt.category, mt.name;
end;
$function$;

-- My Templates listing. Union of the two content tables a workspace's
-- installations can point at -- kept as one function (rather than one RPC
-- per content type) since both branches return the same shape.
create or replace function public.list_workspace_templates(p_workspace_id uuid)
returns table (
  installation_id uuid,
  marketplace_template_id uuid,
  marketplace_name text,
  category text,
  source_table text,
  copy_id uuid,
  name text,
  copy_status text,
  installed_version integer,
  current_master_version integer,
  installed_at timestamptz,
  copy_updated_at timestamptz,
  is_customized boolean
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to view templates for this workspace';
  end if;

  return query
  select
    wti.id, wti.marketplace_template_id, mt.name, mt.category, wti.source_table,
    ot.id, ot.name, ot.status, wti.installed_version, mt.version, wti.installed_at, ot.updated_at,
    (ot.updated_at > wti.installed_at)
  from public.workspace_template_installations wti
  join public.marketplace_templates mt on mt.id = wti.marketplace_template_id
  join public.organizer_templates ot on ot.id = wti.copy_object_id
  where wti.workspace_id = p_workspace_id
    and wti.source_table = 'organizer_templates'
    and ot.status <> 'archived'

  union all

  select
    wti.id, wti.marketplace_template_id, mt.name, mt.category, wti.source_table,
    a.id, a.name, a.status, wti.installed_version, mt.version, wti.installed_at, a.updated_at,
    (a.updated_at > wti.installed_at)
  from public.workspace_template_installations wti
  join public.marketplace_templates mt on mt.id = wti.marketplace_template_id
  join public.automations a on a.id = wti.copy_object_id
  where wti.workspace_id = p_workspace_id
    and wti.source_table = 'automations'
    and a.status <> 'archived'

  order by installed_at desc;
end;
$function$;

-- Install (and reinstall -- same operation). Atomic: duplicate_config_object
-- and the installation-row insert run inside this function's own implicit
-- transaction, so a failure partway through leaves nothing behind. Always
-- produces a brand-new workspace copy from the CURRENT master, never touches
-- or resurrects a prior (possibly customized, possibly deleted) copy.
create or replace function public.install_marketplace_template(p_workspace_id uuid, p_marketplace_template_id uuid, p_name text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_template record;
  v_workspace_type text;
  v_already_installed boolean;
  v_new_id uuid;
  v_installation_id uuid;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to install templates into this workspace';
  end if;

  select * into v_template from public.marketplace_templates where id = p_marketplace_template_id;
  if v_template is null then
    raise exception 'template not found';
  end if;
  if v_template.status <> 'published' then
    raise exception 'this template is not currently available';
  end if;

  select w.workspace_type into v_workspace_type from public.workspaces w where w.id = p_workspace_id;
  if v_workspace_type is null or not (v_workspace_type = any(v_template.eligible_workspace_types)) then
    raise exception 'this template is not available for your workspace type';
  end if;

  select exists (
    select 1
    from public.workspace_template_installations wti
    where wti.workspace_id = p_workspace_id
      and wti.marketplace_template_id = p_marketplace_template_id
      and (
        (wti.source_table = 'organizer_templates' and exists (select 1 from public.organizer_templates ot where ot.id = wti.copy_object_id and ot.status <> 'archived'))
        or
        (wti.source_table = 'automations' and exists (select 1 from public.automations a where a.id = wti.copy_object_id and a.status <> 'archived'))
      )
  ) into v_already_installed;

  if v_already_installed then
    raise exception 'this template is already installed -- delete the existing copy before reinstalling';
  end if;

  v_new_id := public.duplicate_config_object(v_template.source_table, v_template.source_object_id, p_workspace_id, p_name);

  -- Belt-and-suspenders on top of the master already being seeded with
  -- is_enabled = false: installing a workflow template must never leave it
  -- able to fire (execute_automation_step's trigger match already requires
  -- status = 'published' too, and duplicate_config_object always clones as
  -- 'draft', so this is doubly inert until an admin explicitly reviews and
  -- publishes/enables it).
  if v_template.source_table = 'automations' then
    update public.automations set is_enabled = false where id = v_new_id;
  end if;

  insert into public.workspace_template_installations (workspace_id, marketplace_template_id, source_table, copy_object_id, installed_version, installed_by)
  values (p_workspace_id, p_marketplace_template_id, v_template.source_table, v_new_id, v_template.version, auth.uid())
  returning id into v_installation_id;

  return v_installation_id;
end;
$function$;

-- Duplicate an already-installed workspace copy (not the master). The
-- duplicate stays tracked in My Templates against the same marketplace
-- template, but never touches the marketplace catalog or the master.
create or replace function public.duplicate_installed_template(p_workspace_id uuid, p_installation_id uuid, p_new_name text default null)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_installation record;
  v_new_id uuid;
  v_new_installation_id uuid;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to duplicate templates in this workspace';
  end if;

  -- workspace_id is part of the WHERE, not checked after the fact -- an
  -- installation_id belonging to a different workspace simply doesn't match
  -- and falls through to "not found" below, the same way a cross-workspace
  -- lookup fails everywhere else in this codebase.
  select * into v_installation
  from public.workspace_template_installations
  where id = p_installation_id and workspace_id = p_workspace_id;

  if v_installation is null then
    raise exception 'installed template not found';
  end if;

  v_new_id := public.duplicate_config_object(v_installation.source_table, v_installation.copy_object_id, p_workspace_id, p_new_name);

  if v_installation.source_table = 'automations' then
    update public.automations set is_enabled = false where id = v_new_id;
  end if;

  insert into public.workspace_template_installations (workspace_id, marketplace_template_id, source_table, copy_object_id, installed_version, installed_by)
  values (p_workspace_id, v_installation.marketplace_template_id, v_installation.source_table, v_new_id, v_installation.installed_version, auth.uid())
  returning id into v_new_installation_id;

  return v_new_installation_id;
end;
$function$;

-- Delete: archives ONLY the workspace's own copy (existing product
-- convention for organizer_templates/automations soft-delete, see
-- set_config_object_status) and never touches the master. Once archived,
-- install_marketplace_template's "already installed" check no longer sees
-- it, so the template is immediately eligible for a clean reinstall.
create or replace function public.delete_installed_template(p_workspace_id uuid, p_installation_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_installation record;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to delete templates in this workspace';
  end if;

  select * into v_installation
  from public.workspace_template_installations
  where id = p_installation_id and workspace_id = p_workspace_id;

  if v_installation is null then
    raise exception 'installed template not found';
  end if;

  perform public.set_config_object_status(v_installation.source_table, v_installation.copy_object_id, 'archived');

  if v_installation.source_table = 'automations' then
    update public.automations set is_enabled = false where id = v_installation.copy_object_id;
  end if;
end;
$function$;

-- Disable/Enable. Reuses the same draft/published status every other
-- config-object table already uses -- "disabled" means draft (invisible to
-- send/fire), "enabled" means published. This never sets automations'
-- separate is_enabled flag, so re-enabling a template here never reactivates
-- live execution on its own -- that stays a deliberate, separate action on
-- the existing Workflows page.
create or replace function public.set_installed_template_enabled(p_workspace_id uuid, p_installation_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_installation record;
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to manage templates in this workspace';
  end if;

  select * into v_installation
  from public.workspace_template_installations
  where id = p_installation_id and workspace_id = p_workspace_id;

  if v_installation is null then
    raise exception 'installed template not found';
  end if;

  perform public.set_config_object_status(v_installation.source_table, v_installation.copy_object_id, case when p_enabled then 'published' else 'draft' end);
end;
$function$;

-- =============================================================================
-- Initial Verexa master templates (four, per spec -- no OTIN template/category)
-- =============================================================================

do $$
declare
  v_org1_id uuid := gen_random_uuid();
  v_org2_id uuid := gen_random_uuid();
  v_ero_automation_id uuid := gen_random_uuid();
  v_sb_automation_id uuid := gen_random_uuid();
begin
  insert into public.organizer_templates (id, workspace_id, name, slug, description, status, is_public, requires_portal_signup)
  values
    (v_org1_id, null, 'Individual + Schedule C Organizer', 'verexa-individual-schedule-c-organizer', 'Verexa master template: intake organizer for individual filers who also report Schedule C business income.', 'published', false, false),
    (v_org2_id, null, 'Corporate Business Organizer', 'verexa-corporate-business-organizer', 'Verexa master template: intake organizer for corporate and business tax clients.', 'published', false, false);

  insert into public.organizer_fields (id, organizer_template_id, field_type, label, display_order, is_required, options)
  values
    (gen_random_uuid(), v_org1_id, 'name', 'Full Legal Name', 0, true, '[]'::jsonb),
    (gen_random_uuid(), v_org1_id, 'dropdown', 'Filing Status', 1, true, '[{"label":"Single","value":"single"},{"label":"Married Filing Jointly","value":"mfj"},{"label":"Married Filing Separately","value":"mfs"},{"label":"Head of Household","value":"hoh"}]'::jsonb),
    (gen_random_uuid(), v_org1_id, 'short_text', 'Schedule C Business Name', 2, false, '[]'::jsonb),
    (gen_random_uuid(), v_org1_id, 'currency', 'Schedule C Gross Business Income', 3, false, '[]'::jsonb);

  insert into public.organizer_fields (id, organizer_template_id, field_type, label, display_order, is_required, options)
  values
    (gen_random_uuid(), v_org2_id, 'short_text', 'Business Legal Name', 0, true, '[]'::jsonb),
    (gen_random_uuid(), v_org2_id, 'ein', 'EIN', 1, true, '[]'::jsonb),
    (gen_random_uuid(), v_org2_id, 'dropdown', 'Entity Type', 2, true, '[{"label":"C-Corporation","value":"c_corp"},{"label":"S-Corporation","value":"s_corp"},{"label":"Partnership","value":"partnership"},{"label":"LLC","value":"llc"}]'::jsonb);

  -- trigger_type 'firm_package.purchased' is the closest existing trigger in
  -- TriggerFields.tsx's "ero_ptin" category -- there is no
  -- "partner/connection created" trigger yet. These ship as reviewable
  -- scaffolds (is_enabled = false, 'draft' after any install/duplicate) for
  -- the admin to re-point at whatever trigger fits their process before ever
  -- enabling; Phase 6A does not add new trigger infrastructure.
  insert into public.automations (id, workspace_id, name, slug, description, trigger_type, trigger_config, is_enabled, status)
  values
    (v_ero_automation_id, null, 'ERO Partner Onboarding', 'verexa-ero-partner-onboarding', 'Verexa master template: onboarding checklist for a new PTIN connecting under your ERO office. Review the trigger and steps before enabling.', 'firm_package.purchased', '{}'::jsonb, false, 'published'),
    (v_sb_automation_id, null, 'Service Bureau Partner Onboarding', 'verexa-service-bureau-partner-onboarding', 'Verexa master template: onboarding checklist for a new ERO or PTIN connecting under your Service Bureau. Review the trigger and steps before enabling.', 'firm_package.purchased', '{}'::jsonb, false, 'published');

  insert into public.automation_steps (id, automation_id, display_order, action_type, action_config)
  values
    (gen_random_uuid(), v_ero_automation_id, 0, 'create_task', '{"title":"Send welcome packet to new partner","description":"Share office contact info, software access, and first-return checklist with the newly connected PTIN."}'::jsonb),
    (gen_random_uuid(), v_sb_automation_id, 0, 'create_task', '{"title":"Send welcome packet to new partner","description":"Share portal access, supported software/bank products, and revenue share terms with the newly connected firm."}'::jsonb);

  insert into public.marketplace_templates (slug, name, description, category, source_table, source_object_id, eligible_workspace_types, status, version)
  values
    ('individual-schedule-c-organizer', 'Individual + Schedule C Organizer', 'Intake organizer for individual filers who also report Schedule C business income.', 'Tax Client', 'organizer_templates', v_org1_id, array['independent_ptin', 'ero_office', 'service_bureau'], 'published', 1),
    ('corporate-business-organizer', 'Corporate Business Organizer', 'Intake organizer for corporate and business tax clients.', 'Tax Client', 'organizer_templates', v_org2_id, array['independent_ptin', 'ero_office', 'service_bureau'], 'published', 1),
    ('ero-partner-onboarding', 'ERO Partner Onboarding', 'Onboarding checklist workflow for a newly connected PTIN.', 'Partner Operations', 'automations', v_ero_automation_id, array['ero_office', 'service_bureau'], 'published', 1),
    ('service-bureau-partner-onboarding', 'Service Bureau Partner Onboarding', 'Onboarding checklist workflow for a newly connected ERO or PTIN under a Service Bureau.', 'Partner Operations', 'automations', v_sb_automation_id, array['service_bureau'], 'published', 1);
end $$;
