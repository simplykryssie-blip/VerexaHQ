-- Phase 0 smoke tests.
--
-- Verifies: seed data landed correctly, create_workspace() provisions an
-- owner + branding + core feature flags atomically, workspace RLS actually
-- isolates two tenants from each other, and invite_workspace_user() rejects
-- cross-workspace calls. Wrapped in BEGIN/ROLLBACK so it never leaves test
-- rows behind -- safe to run directly against the project.
--
-- Run via the Supabase SQL editor, `supabase db execute -f`, or the
-- execute_sql MCP tool.

begin;

do $$
declare
  v_user_id uuid := gen_random_uuid();
  v_other_user_id uuid := gen_random_uuid();
  v_workspace_id uuid;
  v_other_workspace_id uuid;
  v_role_count int;
  v_permission_count int;
  v_core_flag_count int;
  v_enabled_flag_count int;
  v_staff_role_id uuid;
  v_rejected boolean := false;
begin
  -- 1. Seed data sanity ------------------------------------------------
  -- 5 original Phase 0 roles + 5 added in the Revision Sprint (Reviewer,
  -- Compliance Officer, Manager, Administrative Staff, Receptionist).
  select count(*) into v_role_count from public.roles where workspace_id is null;
  assert v_role_count = 10, format('expected 10 system roles, got %s', v_role_count);

  select count(*) into v_permission_count from public.permissions;
  assert v_permission_count >= 30, format('expected >=30 permissions, got %s', v_permission_count);

  select count(*) into v_core_flag_count from public.feature_flags where is_core;
  assert v_core_flag_count = 12, format('expected 12 core feature flags, got %s', v_core_flag_count);

  assert (
    select bool_and(exists (
      select 1 from public.role_permissions rp
      join public.roles r on r.id = rp.role_id
      where r.slug = 'owner' and r.workspace_id is null and rp.permission_id = p.id
    ))
    from public.permissions p
  ), 'owner role is missing at least one permission grant';

  -- fake auth.users rows so workspace_users/audit FKs resolve (rolled back below)
  insert into auth.users (id, email) values
    (v_user_id, 'owner+phase0test@example.com'),
    (v_other_user_id, 'other+phase0test@example.com');

  -- 2. create_workspace as v_user_id ------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_user_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_workspace_id := public.create_workspace('Phase 0 Test Firm', 'independent_ptin', 'America/New_York');
  reset role;

  assert v_workspace_id is not null, 'create_workspace did not return an id';

  select count(*) into v_enabled_flag_count
  from public.workspace_feature_flags wff
  join public.feature_flags ff on ff.id = wff.feature_flag_id
  where wff.workspace_id = v_workspace_id and ff.is_core and wff.is_enabled;
  assert v_enabled_flag_count = 12, format('expected 12 enabled core flags on new workspace, got %s', v_enabled_flag_count);

  assert exists (
    select 1 from public.workspace_users
    where workspace_id = v_workspace_id and user_id = v_user_id and is_owner and status = 'active'
  ), 'creator was not made an active owner';

  assert exists (
    select 1 from public.branding where workspace_id = v_workspace_id
  ), 'branding row was not created';

  assert exists (
    select 1 from public.audit_log where entity_type = 'workspaces' and entity_id = v_workspace_id and action = 'insert'
  ), 'workspace creation was not audited';

  -- 3. RLS isolation between tenants ------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_other_user_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  assert not exists (select 1 from public.workspaces where id = v_workspace_id),
    'a non-member could see another workspace via RLS';
  assert not exists (select 1 from public.workspace_users where workspace_id = v_workspace_id),
    'a non-member could see workspace_users via RLS';
  assert not exists (select 1 from public.branding where workspace_id = v_workspace_id),
    'a non-member could see branding via RLS';

  v_other_workspace_id := public.create_workspace('Phase 0 Second Firm', 'ero_office');
  reset role;

  -- 4. invite_workspace_user must reject cross-workspace admin actions --
  select id into v_staff_role_id from public.roles where slug = 'staff' and workspace_id is null;

  perform set_config('request.jwt.claims', json_build_object('sub', v_user_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.invite_workspace_user(v_other_workspace_id, v_other_user_id, v_staff_role_id);
  exception when others then
    v_rejected := true;
  end;
  reset role;

  assert v_rejected, 'invite_workspace_user did not reject a non-admin acting on a foreign workspace';

  raise notice 'Phase 0 smoke tests passed';
end $$;

rollback;
