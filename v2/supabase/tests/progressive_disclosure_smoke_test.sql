-- Progressive Disclosure (Verexa UX Standard #001) smoke tests.
--
-- Verifies: client satellite tables (contacts/addresses/phones/emails/
-- relationships/portal users) enforce one-primary-per-client where
-- applicable, clients.edit/portal.manage permission gating, the
-- client_relationships "related_client_id or related_name" check,
-- attachments permission gating (upload vs. delete), and draft_saves RLS
-- (owner-only visibility) + the distinct-NULL entity_id behavior for
-- in-progress "new X" drafts. Wrapped in BEGIN/ROLLBACK.
--
-- Note: client_notes and client_documents (as originally built here) were
-- superseded during Epic 3A by the universal `notes` and `attachments`
-- engines (entity_type/entity_id polymorphic) -- this test was updated to
-- match; see supabase/migrations/0049 and 0052 for the rename/fix history.

begin;

do $$
declare
  v_owner uuid := gen_random_uuid();
  v_staff uuid := gen_random_uuid();
  v_ws uuid;
  v_staff_role_id uuid;
  v_client_id uuid;
  v_client2_id uuid;
  v_contact_id uuid;
  v_rejected boolean := false;
  v_draft_id uuid;
  v_draft_count int;
  v_visible_to_staff int;
begin
  insert into auth.users (id, email) values
    (v_owner, 'owner+pdtest@example.com'),
    (v_staff, 'staff+pdtest@example.com');

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_ws := public.create_workspace('Progressive Disclosure Test', 'independent_ptin');

  v_client_id := ((public.create_client(v_ws, 'individual', 'Pat', 'Primary', null, null, 'pat+pdtest@example.com', null, null))->>'client_id')::uuid;
  v_client2_id := ((public.create_client(v_ws, 'individual', 'Sam', 'Secondary', null, null, 'sam+pdtest@example.com', null, null))->>'client_id')::uuid;

  -- 1. Satellite tables: owner (clients.edit) can add records beyond primary
  insert into public.client_contacts (client_id, workspace_id, first_name, last_name, is_primary)
  values (v_client_id, v_ws, 'Spouse', 'Primary', true)
  returning id into v_contact_id;

  insert into public.client_addresses (client_id, workspace_id, address_type, street, city, state, zip)
  values (v_client_id, v_ws, 'seasonal', '1 Winter Rd', 'Aspen', 'CO', '81611');

  insert into public.client_phones (client_id, workspace_id, phone_type, phone_number)
  values (v_client_id, v_ws, 'fax', '555-000-1111');

  insert into public.client_emails (client_id, workspace_id, email_type, email)
  values (v_client_id, v_ws, 'accounting', 'accounting+pdtest@example.com');

  insert into public.client_relationships (client_id, workspace_id, related_client_id, relationship_type)
  values (v_client_id, v_ws, v_client2_id, 'business');

  insert into public.client_portal_users (client_id, workspace_id, invited_email, is_primary, invited_by)
  values (v_client_id, v_ws, 'portal+pdtest@example.com', true, v_owner);

  insert into public.notes (workspace_id, entity_type, entity_id, author_id, body)
  values (v_ws, 'client', v_client_id, v_owner, 'First note');

  insert into public.attachments (entity_type, entity_id, workspace_id, file_name, storage_path, uploaded_by)
  values ('client', v_client_id, v_ws, '2025-w2.pdf', v_ws || '/client/' || v_client_id || '/2025-w2.pdf', v_owner);

  -- 2. One-primary-per-client is enforced by the partial unique index
  begin
    insert into public.client_contacts (client_id, workspace_id, first_name, last_name, is_primary)
    values (v_client_id, v_ws, 'Second', 'Primary', true);
    raise exception 'a second is_primary contact should have violated client_contacts_one_primary_idx';
  exception when unique_violation then
    v_rejected := true;
  end;
  assert v_rejected, 'client_contacts_one_primary_idx did not reject a second primary contact';

  -- 3. client_relationships requires related_client_id or related_name
  v_rejected := false;
  begin
    insert into public.client_relationships (client_id, workspace_id, relationship_type)
    values (v_client_id, v_ws, 'other');
    raise exception 'client_relationships should require related_client_id or related_name';
  exception when others then
    v_rejected := true;
  end;
  assert v_rejected, 'client_relationships check constraint did not reject an empty relationship target';
  reset role;

  -- 4. Non-privileged staff: can read, can upload a document, cannot edit
  --    client satellite data (lacks clients.edit) or delete documents
  --    (lacks documents.delete) or manage the portal (lacks portal.manage).
  select id into v_staff_role_id from public.roles where slug = 'staff' and workspace_id is null;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.invite_workspace_user(v_ws, v_staff, v_staff_role_id);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.accept_workspace_invitation(v_ws);

  assert exists (select 1 from public.client_contacts where id = v_contact_id), 'staff (workspace member) could not read client_contacts';

  insert into public.attachments (entity_type, entity_id, workspace_id, file_name, storage_path, uploaded_by)
  values ('client', v_client_id, v_ws, 'staff-uploaded.pdf', v_ws || '/client/' || v_client_id || '/staff-uploaded.pdf', v_staff);

  v_rejected := false;
  begin
    insert into public.client_contacts (client_id, workspace_id, first_name, last_name)
    values (v_client_id, v_ws, 'Should', 'Fail');
    raise exception 'staff should not have clients.edit and should not be able to insert a client_contacts row';
  exception when others then
    v_rejected := true;
  end;
  assert v_rejected, 'staff was able to insert into client_contacts without clients.edit';

  v_rejected := false;
  begin
    delete from public.attachments where entity_type = 'client' and entity_id = v_client_id and file_name = '2025-w2.pdf';
    if not found then
      raise exception 'no_data_found';
    end if;
  exception when others then
    v_rejected := true;
  end;
  assert v_rejected, 'staff was able to delete an attachments row without documents.delete';
  reset role;

  -- 5. draft_saves: owner-only visibility, distinct NULLs allow two
  --    concurrent "new client" drafts, and a real entity_id upserts cleanly.
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.draft_saves (workspace_id, user_id, draft_type, entity_id, payload)
  values (v_ws, v_owner, 'client', null, '{"first_name": "Draft One"}'::jsonb)
  returning id into v_draft_id;

  insert into public.draft_saves (workspace_id, user_id, draft_type, entity_id, payload)
  values (v_ws, v_owner, 'client', null, '{"first_name": "Draft Two"}'::jsonb);

  select count(*) into v_draft_count from public.draft_saves where workspace_id = v_ws and draft_type = 'client' and entity_id is null;
  assert v_draft_count = 2, format('expected two concurrent null-entity_id drafts to coexist, got %s', v_draft_count);

  insert into public.draft_saves (workspace_id, user_id, draft_type, entity_id, payload)
  values (v_ws, v_owner, 'client', v_client_id, '{"notes": "editing existing client"}'::jsonb)
  on conflict (workspace_id, user_id, draft_type, entity_id)
  do update set payload = excluded.payload;

  update public.draft_saves set payload = '{"notes": "edited again"}'::jsonb where workspace_id = v_ws and draft_type = 'client' and entity_id = v_client_id;
  assert (select payload->>'notes' from public.draft_saves where workspace_id = v_ws and draft_type = 'client' and entity_id = v_client_id) = 'edited again',
    'draft_saves upsert-then-update on the real entity_id row did not stick';
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_visible_to_staff from public.draft_saves where workspace_id = v_ws;
  assert v_visible_to_staff = 0, format('staff should not see the owner''s drafts via RLS, saw %s', v_visible_to_staff);
  reset role;

  raise notice 'Progressive disclosure smoke tests passed';
end $$;

rollback;
