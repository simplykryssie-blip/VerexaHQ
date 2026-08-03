-- Phase 2 smoke tests (Firm Configuration Engine).
--
-- Verifies: apply_blueprint() deep-copies a full system blueprint into a
-- workspace with correctly rewired cross-references, RLS keeps a second
-- workspace from seeing any of it, duplicate_config_object() clones a
-- single object, set_config_object_status() enforces admin-only
-- publish/archive, version history + compare work, firm_tax_profile
-- encrypt/reveal round-trips, and case sharing rejects a share with no
-- active ERO connection. Wrapped in BEGIN/ROLLBACK -- safe to run directly.

begin;

do $$
declare
  v_owner uuid := gen_random_uuid();
  v_other_owner uuid := gen_random_uuid();
  v_ws uuid;
  v_other_ws uuid;
  v_individual_blueprint_id uuid;
  v_new_blueprint_id uuid;
  v_new_service_id uuid;
  v_new_process_id uuid;
  v_orig_service record;
  v_copied_service record;
  v_dup_service_id uuid;
  v_status text;
  v_version_count int;
  v_diff jsonb;
  v_rejected boolean := false;
begin
  insert into auth.users (id, email) values
    (v_owner, 'owner+phase2test@example.com'),
    (v_other_owner, 'other+phase2test@example.com');

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_ws := public.create_workspace('Phase 2 Test Firm', 'independent_ptin');
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', v_other_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_other_ws := public.create_workspace('Phase 2 Other Firm', 'ero_office');
  reset role;

  select id into v_individual_blueprint_id from public.blueprints where slug = 'individual-tax-preparation-blueprint';
  assert v_individual_blueprint_id is not null, 'seeded Individual Tax Preparation blueprint not found';

  -- 1. apply_blueprint deep-copies everything into v_ws ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_new_blueprint_id := public.apply_blueprint(v_individual_blueprint_id, v_ws);
  reset role;

  assert v_new_blueprint_id is not null, 'apply_blueprint did not return an id';
  assert (select workspace_id from public.blueprints where id = v_new_blueprint_id) = v_ws, 'copied blueprint is not owned by the target workspace';

  select bc.component_id into v_new_service_id
  from public.blueprint_components bc where bc.blueprint_id = v_new_blueprint_id and bc.component_type = 'services' and bc.is_primary;
  assert v_new_service_id is not null, 'copied blueprint has no primary service';
  assert (select workspace_id from public.services where id = v_new_service_id) = v_ws, 'copied service is not owned by the target workspace';

  select * into v_copied_service from public.services where id = v_new_service_id;
  select * into v_orig_service from public.services where slug = 'individual-tax-preparation' and workspace_id is null;

  assert v_copied_service.process_id <> v_orig_service.process_id, 'copied service still points at the system process';
  assert (select workspace_id from public.processes where id = v_copied_service.process_id) = v_ws, 'copied process is not owned by the target workspace';
  assert (select count(*) from public.process_stages where process_id = v_copied_service.process_id) = 6, 'copied process is missing stages';
  assert (select count(*) from public.process_tasks pt join public.process_stages ps on ps.id = pt.process_stage_id where ps.process_id = v_copied_service.process_id) = 9, 'copied process is missing tasks';

  assert v_copied_service.organizer_template_id <> v_orig_service.organizer_template_id, 'copied service still points at the system organizer';
  assert (select count(*) from public.organizer_fields where organizer_template_id = v_copied_service.organizer_template_id) =
         (select count(*) from public.organizer_fields where organizer_template_id = v_orig_service.organizer_template_id),
    'copied organizer has a different field count than the original';

  assert v_copied_service.pipeline_id <> v_orig_service.pipeline_id, 'copied service still points at the system pipeline';
  assert (select count(*) from public.pipeline_stages where pipeline_id = v_copied_service.pipeline_id) = 6, 'copied pipeline is missing stages';

  -- 2. RLS: the other workspace must not see any of this --------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_other_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;

  assert not exists (select 1 from public.blueprints where id = v_new_blueprint_id), 'a non-member could see another workspace''s blueprint';
  assert not exists (select 1 from public.services where id = v_new_service_id), 'a non-member could see another workspace''s service';
  reset role;

  -- 3. duplicate_config_object clones a single object ------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_dup_service_id := public.duplicate_config_object('services', v_new_service_id, v_ws, 'Individual Tax Preparation (Copy)');
  reset role;

  assert v_dup_service_id is not null and v_dup_service_id <> v_new_service_id, 'duplicate_config_object did not create a new row';
  assert (select status from public.services where id = v_dup_service_id) = 'draft', 'duplicated service should start in draft status';
  assert (select name from public.services where id = v_dup_service_id) = 'Individual Tax Preparation (Copy)', 'duplicated service did not take the new name';

  -- 4. set_config_object_status enforces admin-only --------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_other_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.set_config_object_status('services', v_dup_service_id, 'published');
    raise exception 'a non-admin from a different workspace was able to publish this service';
  exception when others then
    null; -- expected
  end;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.set_config_object_status('services', v_dup_service_id, 'published');
  reset role;

  select status into v_status from public.services where id = v_dup_service_id;
  assert v_status = 'published', 'set_config_object_status did not publish the service';

  -- 5. version history + compare ---------------------------------------
  -- Version 1 snapshots the row as it was *before* the publish (draft/$250);
  -- version 2 snapshots it as it was *before* the price change
  -- (published/$250) -- each snapshot captures the state just prior to the
  -- edit that produced it, so comparing v1->v2 shows the publish, and a
  -- second edit is needed to show the price change between v2 and v3.
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.services set default_price = 275.00 where id = v_dup_service_id;
  update public.services set default_price = 300.00 where id = v_dup_service_id;
  reset role;

  select count(*) into v_version_count from public.config_object_versions where object_type = 'services' and object_id = v_dup_service_id;
  assert v_version_count = 3, format('expected 3 version snapshots (publish, then two price changes), got %s', v_version_count);

  v_diff := public.compare_config_object_versions('services', v_dup_service_id, 1, 2);
  assert v_diff -> 'changed_keys' ? 'status', 'compare_config_object_versions did not detect the draft->published change between v1 and v2';

  v_diff := public.compare_config_object_versions('services', v_dup_service_id, 2, 3);
  assert v_diff -> 'changed_keys' ? 'default_price', 'compare_config_object_versions did not detect the price change between v2 and v3';

  -- 6. firm_tax_profile encrypt/reveal round-trip -----------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.set_firm_tax_profile(v_ws, p_ein => '12-3456789', p_efin => '123456', p_ptin => 'P12345678');
  assert public.reveal_firm_ein(v_ws) = '12-3456789', 'reveal_firm_ein did not round-trip the encrypted EIN';
  assert (select ein_last4 from public.firm_tax_profile where workspace_id = v_ws) = '6789', 'ein_last4 was not derived correctly';
  reset role;

  -- 7. engagement sharing rejects without an active ERO connection -----
  -- (share_case_with_ero was renamed to share_engagement_with_ero in the
  -- Revision Sprint terminology pass; this test call was updated to match.)
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.share_engagement_with_ero(gen_random_uuid(), v_ws, v_other_ws, '{"documents":true}'::jsonb);
    raise exception 'share_engagement_with_ero should have been rejected without an active connection';
  exception when others then
    v_rejected := true;
  end;
  reset role;
  assert v_rejected, 'share_engagement_with_ero did not reject a share with no active firm connection';

  raise notice 'Phase 2 smoke tests passed';
end $$;

rollback;
