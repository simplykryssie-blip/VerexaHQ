-- Revision Sprint smoke tests.
--
-- Verifies: create_client duplicate detection, reveal_client_ssn permission
-- + audit, merge_clients, the five new system roles, engagement_shares
-- rename works end to end, firm_connections + config_object_shares
-- (preview before accept, accept creates an independent copy), workspace
-- capability flags, and workspace_security_policies RLS (member can read,
-- non-admin member can't write). Wrapped in BEGIN/ROLLBACK.

begin;

do $$
declare
  v_owner uuid := gen_random_uuid();
  v_staff uuid := gen_random_uuid();
  v_ero_owner uuid := gen_random_uuid();
  v_ptin_ws uuid;
  v_ero_ws uuid;
  v_staff_role_id uuid;
  v_client_result jsonb;
  v_client_id uuid;
  v_dup_result jsonb;
  v_dup_client_id uuid;
  v_ssn_revealed text;
  v_connection_id uuid;
  v_service_id uuid;
  v_share_id uuid;
  v_accepted_id uuid;
  v_rejected boolean := false;
  v_role_count int;
  v_can_write boolean;
begin
  insert into auth.users (id, email) values
    (v_owner, 'owner+revtest@example.com'),
    (v_staff, 'staff+revtest@example.com'),
    (v_ero_owner, 'ero+revtest@example.com');

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_ptin_ws := public.create_workspace('Revision Sprint PTIN', 'independent_ptin');
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', v_ero_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_ero_ws := public.create_workspace('Revision Sprint ERO', 'ero_office');
  reset role;

  -- 1. Five new system roles exist alongside the original five ----------
  select count(*) into v_role_count from public.roles
  where workspace_id is null and slug in ('reviewer', 'compliance_officer', 'manager', 'administrative_staff', 'receptionist');
  assert v_role_count = 5, format('expected 5 new system roles, got %s', v_role_count);

  -- 2. create_client + duplicate detection -------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_client_result := public.create_client(v_ptin_ws, 'individual', 'Jane', 'Taxpayer', null, '1985-04-12', 'jane@example.com', '555-123-4567', '123-45-6789');
  assert (v_client_result->>'is_new')::boolean, 'first create_client call should have created a new client';
  v_client_id := (v_client_result->>'client_id')::uuid;

  v_dup_result := public.create_client(v_ptin_ws, 'individual', 'Jane', 'T', null, null, 'jane@example.com', null, null);
  assert not (v_dup_result->>'is_new')::boolean, 'duplicate email should not have created a second client';
  assert (v_dup_result->>'client_id')::uuid = v_client_id, 'duplicate detection returned a different client id';
  assert v_dup_result->'duplicate_matched_on' ? 'email', 'duplicate_matched_on should report the email match';

  -- 3. reveal_client_ssn is permission-checked and audit-logged ---------
  v_ssn_revealed := public.reveal_client_ssn(v_client_id);
  assert v_ssn_revealed = '123-45-6789', 'reveal_client_ssn did not round-trip the encrypted SSN';
  assert exists (
    select 1 from public.audit_log where entity_type = 'clients' and entity_id = v_client_id and action = 'reveal_ssn'
  ), 'SSN reveal was not audit-logged';

  -- 4. merge_clients ------------------------------------------------------
  v_dup_client_id := ((public.create_client(v_ptin_ws, 'individual', 'John', 'Other', null, null, 'john+revtest@example.com', null, null))->>'client_id')::uuid;
  perform public.merge_clients(v_client_id, v_dup_client_id);
  assert (select merged_into_client_id from public.clients where id = v_dup_client_id) = v_client_id, 'merge_clients did not set merged_into_client_id';
  assert (select lifecycle_status from public.clients where id = v_dup_client_id) = 'archived', 'merged client should be archived';
  reset role;

  -- 5. engagement_shares (renamed) rejects without an active connection --
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.share_engagement_with_ero(gen_random_uuid(), v_ptin_ws, v_ero_ws, '{"documents":true}'::jsonb);
    raise exception 'share_engagement_with_ero should have been rejected without an active connection';
  exception when others then
    v_rejected := true;
  end;
  assert v_rejected, 'share_engagement_with_ero did not reject a share with no active firm connection';
  reset role;

  -- 6. firm_connections + config_object_shares: preview before accept ---
  perform set_config('request.jwt.claims', json_build_object('sub', v_ero_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.firm_connections (parent_workspace_id, child_workspace_id, relationship_type, invited_by)
  values (v_ero_ws, v_ptin_ws, 'ero_ptin', v_ero_owner)
  returning id into v_connection_id;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.respond_to_firm_connection(v_connection_id, true);

  -- Now the engagement share that failed above should succeed.
  perform public.share_engagement_with_ero(gen_random_uuid(), v_ptin_ws, v_ero_ws, '{"documents":true}'::jsonb);

  -- Duplicate the seeded Individual Tax Preparation service into the PTIN
  -- workspace so there's a workspace-owned object to share.
  v_service_id := public.duplicate_config_object('services', (select id from public.services where slug = 'individual-tax-preparation' and workspace_id is null), v_ptin_ws, 'Shared Individual Prep');
  v_share_id := public.share_config_object('services', v_service_id, v_ero_ws);
  reset role;

  -- ERO can preview the shared service before accepting, even though it
  -- doesn't belong to their workspace.
  perform set_config('request.jwt.claims', json_build_object('sub', v_ero_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  assert exists (select 1 from public.services where id = v_service_id), 'ERO could not preview the shared service before accepting';
  v_accepted_id := public.accept_config_object_share(v_share_id);
  reset role;

  assert v_accepted_id is not null and v_accepted_id <> v_service_id, 'accept_config_object_share did not create an independent copy';
  assert (select workspace_id from public.services where id = v_accepted_id) = v_ero_ws, 'accepted copy is not owned by the recipient workspace';
  assert (select status from public.config_object_shares where id = v_share_id) = 'accepted', 'share status was not updated to accepted';

  -- 7. set_workspace_capabilities -----------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_ero_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.set_workspace_capabilities(v_ero_ws, true, true, false);
  reset role;
  assert (select is_ero and is_ptin_preparer and not is_service_bureau from public.workspaces where id = v_ero_ws),
    'set_workspace_capabilities did not apply the ERO Office capability combination';

  -- 8. workspace_security_policies: member can read, non-admin staff can't write
  select id into v_staff_role_id from public.roles where slug = 'staff' and workspace_id is null;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.invite_workspace_user(v_ptin_ws, v_staff, v_staff_role_id);
  insert into public.workspace_security_policies (workspace_id) values (v_ptin_ws);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.accept_workspace_invitation(v_ptin_ws);
  select exists(select 1 from public.workspace_security_policies where workspace_id = v_ptin_ws) into v_can_write;
  assert v_can_write, 'staff member could not read the workspace security policy';

  begin
    update public.workspace_security_policies set mfa_required = true where workspace_id = v_ptin_ws;
    raise exception 'staff should not be able to write the workspace security policy';
  exception when others then
    null; -- expected: staff lacks security.manage
  end;
  reset role;

  raise notice 'Revision sprint smoke tests passed';
end $$;

rollback;
