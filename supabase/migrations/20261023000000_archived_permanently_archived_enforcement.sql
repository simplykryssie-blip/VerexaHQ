-- P1: enforce the full non-operational workspace lifecycle (suspended ->
-- archived -> permanently_archived), not just suspended.
--
-- is_workspace_operational(workspace_id) (20261016000000_rls_suspension_enforcement.sql)
-- was already correct for this: it's an allow-list (`status = 'active'`),
-- so it already treats suspended/archived/permanently_archived identically
-- as non-operational wherever it's actually wired in. The application-layer
-- gates (lib/workspace.ts's workspaceOperationalError, app/(app)/layout.tsx,
-- the client portal) hardcoded "suspended" only -- fixed in this same PR's
-- TypeScript changes, no migration needed for those.
--
-- This migration closes two concrete SQL-layer bypasses found while
-- security-testing the representative high-risk paths this release audit
-- asked for (client creation, engagement creation, pipeline mutation) against
-- a disposable archived test workspace:
--
-- 1. create_client() and create_engagement() are SECURITY DEFINER RPCs that
--    check has_permission(...) but never is_workspace_operational(...) --
--    since they insert directly (bypassing RLS, which is the whole point of
--    SECURITY DEFINER here), the correctly-gated clients_update/
--    engagements_insert RLS policies never come into play for these actual
--    application code paths. A member with clients.create/engagements.manage
--    could create new clients/engagements in an archived (or even a
--    suspended) workspace via these RPCs today. This is not new to
--    archived -- suspended was already silently bypassed by the same gap;
--    fixing it here closes it for every non-operational status at once.
--
-- 2. pipeline_runs_update / pipeline_stages_update RLS policies (the
--    Kanban board's stage-move path, staff-driven and separate from the
--    automation engine's own move_pipeline_stage action, which already
--    checks is_workspace_operational inside execute_automation_step) never
--    included the operational gate at all.
--
-- Deliberately NOT a broader SECURITY DEFINER audit -- these are the two
-- concrete bypasses found while testing the specific representative paths
-- this task named (client/engagement creation, pipeline mutation). See the
-- P1 report's Remaining Issues for the broader pattern this suggests.

create or replace function public.create_client(
  p_workspace_id uuid,
  p_client_type text,
  p_first_name text default null::text,
  p_last_name text default null::text,
  p_business_name text default null::text,
  p_date_of_birth date default null::date,
  p_primary_email text default null::text,
  p_primary_phone text default null::text,
  p_ssn text default null::text,
  p_ein text default null::text,
  p_itin text default null::text,
  p_force_create boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_normalized_email citext;
  v_normalized_phone text;
  v_ssn_hash text;
  v_ein_hash text;
  v_existing record;
  v_new_id uuid;
begin
  if not public.has_permission(p_workspace_id, 'clients.create') then
    raise exception 'insufficient permissions to create a client in this workspace';
  end if;
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  if p_client_type not in ('individual', 'business', 'trust', 'estate', 'organization') then
    raise exception 'Unrecognized client type: %', p_client_type;
  end if;

  v_normalized_email := nullif(lower(btrim(p_primary_email)), '');
  v_normalized_phone := nullif(regexp_replace(coalesce(p_primary_phone, ''), '\D', '', 'g'), '');
  v_ssn_hash := case when p_ssn is not null and btrim(p_ssn) <> ''
    then encode(digest(regexp_replace(p_ssn, '\D', '', 'g') || p_workspace_id::text, 'sha256'), 'hex') end;
  v_ein_hash := case when p_ein is not null and btrim(p_ein) <> ''
    then encode(digest(regexp_replace(p_ein, '\D', '', 'g') || p_workspace_id::text, 'sha256'), 'hex') end;

  if not p_force_create then
    select id, array_remove(array[
        case when v_ssn_hash is not null and ssn_hash = v_ssn_hash then 'ssn' end,
        case when v_ein_hash is not null and ein_hash = v_ein_hash then 'ein' end,
        case when v_normalized_email is not null and normalized_email = v_normalized_email then 'email' end,
        case when v_normalized_phone is not null and normalized_phone = v_normalized_phone then 'phone' end
      ], null) as matched_on
    into v_existing
    from public.clients
    where workspace_id = p_workspace_id
      and merged_into_client_id is null
      and (
        (v_ssn_hash is not null and ssn_hash = v_ssn_hash)
        or (v_ein_hash is not null and ein_hash = v_ein_hash)
        or (v_normalized_email is not null and normalized_email = v_normalized_email)
        or (v_normalized_phone is not null and normalized_phone = v_normalized_phone)
      )
    limit 1;

    if v_existing.id is not null then
      return jsonb_build_object('client_id', v_existing.id, 'is_new', false, 'duplicate_matched_on', to_jsonb(v_existing.matched_on));
    end if;
  end if;

  insert into public.clients (
    workspace_id, client_type, first_name, last_name, business_name, date_of_birth,
    primary_email, primary_phone, normalized_email, normalized_phone,
    ssn_encrypted, ssn_last4, ssn_hash, ein_encrypted, ein_last4, ein_hash,
    itin_encrypted, itin_last4, itin_hash, created_by
  ) values (
    p_workspace_id, p_client_type, p_first_name, p_last_name, p_business_name, p_date_of_birth,
    p_primary_email, p_primary_phone, v_normalized_email, v_normalized_phone,
    public.encrypt_client_secret(p_ssn), nullif(right(regexp_replace(coalesce(p_ssn, ''), '\D', '', 'g'), 4), ''), v_ssn_hash,
    public.encrypt_client_secret(p_ein), nullif(right(regexp_replace(coalesce(p_ein, ''), '\D', '', 'g'), 4), ''), v_ein_hash,
    public.encrypt_client_secret(p_itin), nullif(right(regexp_replace(coalesce(p_itin, ''), '\D', '', 'g'), 4), ''),
    case when p_itin is not null and btrim(p_itin) <> '' then encode(digest(regexp_replace(p_itin, '\D', '', 'g') || p_workspace_id::text, 'sha256'), 'hex') end,
    auth.uid()
  )
  returning id into v_new_id;

  return jsonb_build_object('client_id', v_new_id, 'is_new', true, 'duplicate_matched_on', '[]'::jsonb);
end;
$function$;

create or replace function public.create_engagement(
  p_workspace_id uuid,
  p_client_id uuid,
  p_service_id uuid default null::uuid,
  p_assigned_staff_id uuid default null::uuid,
  p_priority engagement_priority default 'Medium'::engagement_priority,
  p_process_id uuid default null::uuid,
  p_case_type text default 'other'::text,
  p_due_date timestamp with time zone default null::timestamp with time zone
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_service record;
  v_process record;
  v_engagement_id uuid;
  v_process_id uuid;
  v_handoff_run_id uuid;
begin
  if not has_permission(p_workspace_id, 'engagements.manage') then
    raise exception 'insufficient permissions to create an engagement in this workspace';
  end if;
  if not public.is_workspace_operational(p_workspace_id) then
    raise exception 'this workspace is not currently operational';
  end if;

  if p_service_id is not null then
    select id, process_id into v_service from services
    where id = p_service_id and (workspace_id is null or workspace_id = p_workspace_id);
    if v_service.id is null then raise exception 'service % not found or not accessible in this workspace', p_service_id; end if;
  end if;

  if p_process_id is not null then
    select id into v_process from processes where id = p_process_id and (workspace_id is null or workspace_id = p_workspace_id);
    if v_process.id is null then raise exception 'pipeline % not found or not accessible in this workspace', p_process_id; end if;
    v_process_id := p_process_id;
  elsif p_service_id is not null then
    v_process_id := v_service.process_id;
  else
    v_process_id := null;
  end if;

  insert into engagements (workspace_id, client_id, service_id, workflow_id, assigned_staff_id, priority, case_type, due_date)
  values (p_workspace_id, p_client_id, p_service_id, v_process_id, p_assigned_staff_id, p_priority, coalesce(p_case_type, 'other'), p_due_date)
  returning id into v_engagement_id;

  if v_process_id is not null then
    update pipeline_runs
    set entity_type = 'engagement', entity_id = v_engagement_id
    where entity_type = 'client' and entity_id = p_client_id
      and process_id = v_process_id and status = 'Active'
    returning id into v_handoff_run_id;

    if v_handoff_run_id is not null then
      update pipeline_stages set entity_type = 'engagement' where pipeline_run_id = v_handoff_run_id;
    else
      perform start_pipeline_run('engagement', v_engagement_id, v_process_id);
    end if;
  end if;

  return v_engagement_id;
end;
$function$;

alter policy pipeline_runs_update on public.pipeline_runs
using (
  (case entity_type
    when 'client' then has_permission(workspace_id, 'clients.edit')
    when 'engagement' then has_permission(workspace_id, 'engagements.manage')
    else false
  end)
  and is_workspace_operational(workspace_id)
);

alter policy pipeline_stages_update on public.pipeline_stages
using (
  (case entity_type
    when 'client' then has_permission(workspace_id, 'clients.edit')
    when 'engagement' then (has_permission(workspace_id, 'engagements.manage') or (select auth.uid()) = assigned_staff_id)
    else false
  end)
  and is_workspace_operational(workspace_id)
)
with check (
  (case entity_type
    when 'client' then has_permission(workspace_id, 'clients.edit')
    when 'engagement' then (has_permission(workspace_id, 'engagements.manage') or (select auth.uid()) = assigned_staff_id)
    else false
  end)
  and is_workspace_operational(workspace_id)
);
