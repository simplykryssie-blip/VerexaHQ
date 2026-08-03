-- Revision Sprint -- Phase 2: Sharing Engine expansion + wizard capability
-- step + Blueprint Preview estimate.
--
-- Extends the existing generic lifecycle system (duplicate_config_object,
-- is_valid_config_table) rather than rebuilding it: config_object_shares is
-- a thin new table that reuses those functions for the actual "Accept ->
-- independent copy" step, and Preview is a targeted RLS widening (one new
-- OR clause) on the 14 config tables' existing _select policies, not new
-- tables.

alter table public.blueprints add column estimated_setup_minutes integer;
comment on column public.blueprints.estimated_setup_minutes is 'Rough minutes to review and apply this blueprint, shown in the Blueprint Preview before a firm installs anything.';

update public.blueprints set estimated_setup_minutes = 15 where slug = 'individual-tax-preparation-blueprint';
update public.blueprints set estimated_setup_minutes = 20 where slug = 'business-tax-preparation-blueprint';
update public.blueprints set estimated_setup_minutes = 10 where slug = 'amended-return-blueprint';
update public.blueprints set estimated_setup_minutes = 5 where slug = 'extension-filing-blueprint';
update public.blueprints set estimated_setup_minutes = 15 where slug = 'irs-notice-response-blueprint';
update public.blueprints set estimated_setup_minutes = 10 where slug = 'tax-planning-blueprint';

-- ============================================================================
-- config_object_shares: Workspace -> Workspace sharing of any configuration
-- object (blueprint, service, process, intake form/organizer, document
-- request, engagement letter, pricing rule, billing rule, automation,
-- email/SMS template) across the firm_connections network. Accepting
-- creates an independent copy via the existing duplicate_config_object();
-- nothing about the sharer's object is ever mutated or exposed for editing.
-- ============================================================================
create table public.config_object_shares (
  id uuid primary key default gen_random_uuid(),
  object_type text not null check (public.is_valid_config_table(object_type)),
  object_id uuid not null,
  shared_by_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  shared_with_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'archived')),
  shared_by uuid references auth.users(id) on delete set null,
  responded_by uuid references auth.users(id) on delete set null,
  responded_at timestamptz,
  accepted_object_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (shared_by_workspace_id <> shared_with_workspace_id)
);
comment on table public.config_object_shares is 'A configuration object shared from one workspace to another over the firm_connections network. Accepting deep-copies it (via duplicate_config_object) into the recipient''s workspace as an independent, editable object.';
comment on column public.config_object_shares.accepted_object_id is 'The id of the independent copy created in the recipient''s workspace once accepted.';

create index config_object_shares_by_idx on public.config_object_shares (shared_by_workspace_id, status);
create index config_object_shares_with_idx on public.config_object_shares (shared_with_workspace_id, status);
create index config_object_shares_object_idx on public.config_object_shares (object_type, object_id);

create trigger set_updated_at before update on public.config_object_shares for each row execute function public.set_updated_at();
create trigger audit_config_object_shares after insert or update or delete on public.config_object_shares for each row execute function public.audit_trigger_fn();

alter table public.config_object_shares enable row level security;

create policy config_object_shares_select on public.config_object_shares
  for select using (
    public.is_workspace_member(shared_by_workspace_id) or public.is_workspace_member(shared_with_workspace_id)
  );

-- No direct INSERT/UPDATE policy: every mutation goes through the RPCs
-- below, which enforce the connection check and the accept-time copy.

-- ============================================================================
-- has_config_object_share_access: lets a recipient workspace preview a
-- shared object (via the widened _select policies below) before deciding
-- whether to accept it.
-- ============================================================================
create or replace function public.has_config_object_share_access(p_table text, p_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.config_object_shares s
    where s.object_type = p_table and s.object_id = p_id
      and s.status in ('pending', 'accepted')
      and public.is_workspace_member(s.shared_with_workspace_id)
  );
$$;

revoke execute on function public.has_config_object_share_access(text, uuid) from public, anon;
grant execute on function public.has_config_object_share_access(text, uuid) to authenticated;

-- Widen every config table's _select policy: system template OR own
-- workspace OR specifically shared with my workspace.
drop policy service_categories_select on public.service_categories;
create policy service_categories_select on public.service_categories
  for select using (workspace_id is null or public.is_workspace_member(workspace_id) or public.has_config_object_share_access('service_categories', id));

drop policy services_select on public.services;
create policy services_select on public.services
  for select using (workspace_id is null or public.is_workspace_member(workspace_id) or public.has_config_object_share_access('services', id));

drop policy processes_select on public.processes;
create policy processes_select on public.processes
  for select using (workspace_id is null or public.is_workspace_member(workspace_id) or public.has_config_object_share_access('processes', id));

drop policy pipelines_select on public.pipelines;
create policy pipelines_select on public.pipelines
  for select using (workspace_id is null or public.is_workspace_member(workspace_id) or public.has_config_object_share_access('pipelines', id));

drop policy organizer_templates_select on public.organizer_templates;
create policy organizer_templates_select on public.organizer_templates
  for select using (workspace_id is null or public.is_workspace_member(workspace_id) or public.has_config_object_share_access('organizer_templates', id));

drop policy document_request_templates_select on public.document_request_templates;
create policy document_request_templates_select on public.document_request_templates
  for select using (workspace_id is null or public.is_workspace_member(workspace_id) or public.has_config_object_share_access('document_request_templates', id));

drop policy engagement_letter_templates_select on public.engagement_letter_templates;
create policy engagement_letter_templates_select on public.engagement_letter_templates
  for select using (workspace_id is null or public.is_workspace_member(workspace_id) or public.has_config_object_share_access('engagement_letter_templates', id));

drop policy email_templates_select on public.email_templates;
create policy email_templates_select on public.email_templates
  for select using (workspace_id is null or public.is_workspace_member(workspace_id) or public.has_config_object_share_access('email_templates', id));

drop policy sms_templates_select on public.sms_templates;
create policy sms_templates_select on public.sms_templates
  for select using (workspace_id is null or public.is_workspace_member(workspace_id) or public.has_config_object_share_access('sms_templates', id));

drop policy pricing_rules_select on public.pricing_rules;
create policy pricing_rules_select on public.pricing_rules
  for select using (workspace_id is null or public.is_workspace_member(workspace_id) or public.has_config_object_share_access('pricing_rules', id));

drop policy billing_rules_select on public.billing_rules;
create policy billing_rules_select on public.billing_rules
  for select using (workspace_id is null or public.is_workspace_member(workspace_id) or public.has_config_object_share_access('billing_rules', id));

drop policy automations_select on public.automations;
create policy automations_select on public.automations
  for select using (workspace_id is null or public.is_workspace_member(workspace_id) or public.has_config_object_share_access('automations', id));

drop policy dashboards_select on public.dashboards;
create policy dashboards_select on public.dashboards
  for select using (workspace_id is null or public.is_workspace_member(workspace_id) or public.has_config_object_share_access('dashboards', id));

drop policy blueprints_select on public.blueprints;
create policy blueprints_select on public.blueprints
  for select using (workspace_id is null or public.is_workspace_member(workspace_id) or public.has_config_object_share_access('blueprints', id));

-- ============================================================================
-- share_config_object / accept_config_object_share / decline_config_object_share
-- / archive_config_object_share
-- ============================================================================
create or replace function public.share_config_object(
  p_table text,
  p_id uuid,
  p_shared_with_workspace_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_workspace_id uuid;
  v_share_id uuid;
begin
  if not public.is_valid_config_table(p_table) then
    raise exception 'unsupported config table: %', p_table;
  end if;

  execute format('select workspace_id from public.%I where id = $1', p_table) into v_owner_workspace_id using p_id;
  if v_owner_workspace_id is null then
    raise exception 'Verexa system objects are already visible to everyone and cannot be shared; only workspace-owned objects can be';
  end if;
  if not public.is_workspace_admin(v_owner_workspace_id) then
    raise exception 'insufficient permissions to share this object';
  end if;
  if not exists (
    select 1 from public.firm_connections
    where status = 'active'
      and ((parent_workspace_id = v_owner_workspace_id and child_workspace_id = p_shared_with_workspace_id)
        or (parent_workspace_id = p_shared_with_workspace_id and child_workspace_id = v_owner_workspace_id))
  ) then
    raise exception 'no active firm connection to share with this workspace';
  end if;

  insert into public.config_object_shares (object_type, object_id, shared_by_workspace_id, shared_with_workspace_id, shared_by)
  values (p_table, p_id, v_owner_workspace_id, p_shared_with_workspace_id, auth.uid())
  returning id into v_share_id;

  return v_share_id;
end;
$$;
comment on function public.share_config_object(text, uuid, uuid) is 'Shares a workspace-owned configuration object with a connected workspace for Preview/Accept/Decline.';

revoke execute on function public.share_config_object(text, uuid, uuid) from public, anon;
grant execute on function public.share_config_object(text, uuid, uuid) to authenticated;

create or replace function public.accept_config_object_share(p_share_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share record;
  v_new_id uuid;
begin
  select * into v_share from public.config_object_shares where id = p_share_id;
  if v_share.id is null then
    raise exception 'share not found';
  end if;
  if not public.is_workspace_admin(v_share.shared_with_workspace_id) then
    raise exception 'insufficient permissions to accept this share';
  end if;
  if v_share.status <> 'pending' then
    raise exception 'this share is no longer pending';
  end if;

  v_new_id := public.duplicate_config_object(v_share.object_type, v_share.object_id, v_share.shared_with_workspace_id, null);

  update public.config_object_shares
  set status = 'accepted', accepted_object_id = v_new_id, responded_by = auth.uid(), responded_at = now()
  where id = p_share_id;

  return v_new_id;
end;
$$;
comment on function public.accept_config_object_share(uuid) is 'Accepts a shared configuration object, creating an independent, editable copy in the recipient''s workspace.';

revoke execute on function public.accept_config_object_share(uuid) from public, anon;
grant execute on function public.accept_config_object_share(uuid) to authenticated;

create or replace function public.decline_config_object_share(p_share_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shared_with_workspace_id uuid;
begin
  select shared_with_workspace_id into v_shared_with_workspace_id from public.config_object_shares where id = p_share_id;
  if v_shared_with_workspace_id is null then
    raise exception 'share not found';
  end if;
  if not public.is_workspace_admin(v_shared_with_workspace_id) then
    raise exception 'insufficient permissions to decline this share';
  end if;

  update public.config_object_shares
  set status = 'declined', responded_by = auth.uid(), responded_at = now()
  where id = p_share_id and status = 'pending';
end;
$$;

revoke execute on function public.decline_config_object_share(uuid) from public, anon;
grant execute on function public.decline_config_object_share(uuid) to authenticated;

create or replace function public.archive_config_object_share(p_share_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_by uuid;
  v_with uuid;
begin
  select shared_by_workspace_id, shared_with_workspace_id into v_by, v_with
  from public.config_object_shares where id = p_share_id;
  if v_by is null then
    raise exception 'share not found';
  end if;
  if not (public.is_workspace_admin(v_by) or public.is_workspace_admin(v_with)) then
    raise exception 'insufficient permissions to archive this share';
  end if;

  update public.config_object_shares set status = 'archived' where id = p_share_id;
end;
$$;

revoke execute on function public.archive_config_object_share(uuid) from public, anon;
grant execute on function public.archive_config_object_share(uuid) to authenticated;

-- ============================================================================
-- set_workspace_capabilities: onboarding wizard's "How do you operate?"
-- step (Independent PTIN / ERO Office / Service Bureau / Service Bureau +
-- ERO). Capabilities are flags, not a hardcoded account type -- a workspace
-- can hold more than one.
-- ============================================================================
create or replace function public.set_workspace_capabilities(
  p_workspace_id uuid,
  p_is_ptin_preparer boolean,
  p_is_ero boolean,
  p_is_service_bureau boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception 'insufficient permissions to change this workspace''s capabilities';
  end if;
  if not (p_is_ptin_preparer or p_is_ero or p_is_service_bureau) then
    raise exception 'a workspace must have at least one capability';
  end if;

  update public.workspaces
  set is_ptin_preparer = p_is_ptin_preparer, is_ero = p_is_ero, is_service_bureau = p_is_service_bureau
  where id = p_workspace_id;
end;
$$;
comment on function public.set_workspace_capabilities(uuid, boolean, boolean, boolean) is 'Sets the workspace''s operating capabilities during onboarding. Independent PTIN = ptin only; ERO Office = ero (+ ptin); Service Bureau = service_bureau; Service Bureau + ERO = both.';

revoke execute on function public.set_workspace_capabilities(uuid, boolean, boolean, boolean) from public, anon;
grant execute on function public.set_workspace_capabilities(uuid, boolean, boolean, boolean) to authenticated;
