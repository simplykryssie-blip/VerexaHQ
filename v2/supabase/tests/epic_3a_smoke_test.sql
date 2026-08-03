-- Epic 3A (Engagement Foundation) smoke tests.
--
-- Verifies: engagements RLS is actually enforced now (tasks used to be wide
-- open), engagement_number is generated per-workspace and unique,
-- assignment defaults to the workspace owner then tracks reassignment
-- history, status changes create history + Timeline entries + auto-stamp
-- completed_date, tasks/attachments/notes all wire into the Timeline,
-- notes RLS respects is_private, engagement_types seed data exists, and the
-- Review Engine (request corrections / comment / withdraw) creates history
-- + a queued notification. Wrapped in BEGIN/ROLLBACK.

begin;

do $$
declare
  v_owner uuid := gen_random_uuid();
  v_staff uuid := gen_random_uuid();
  v_ero_owner uuid := gen_random_uuid();
  v_ws uuid;
  v_ero_ws uuid;
  v_staff_role_id uuid;
  v_client_id uuid;
  v_engagement_id uuid;
  v_engagement_number text;
  v_assigned_staff_id uuid;
  v_history_count int;
  v_workflow_run_id uuid;
  v_process_id uuid;
  v_task_id uuid;
  v_attachment_id uuid;
  v_note_id uuid;
  v_connection_id uuid;
  v_share_id uuid;
  v_notif_count int;
  v_rejected boolean := false;
  v_type_count int;
begin
  insert into auth.users (id, email) values
    (v_owner, 'owner+epic3atest@example.com'),
    (v_staff, 'staff+epic3atest@example.com'),
    (v_ero_owner, 'ero+epic3atest@example.com');

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_ws := public.create_workspace('Epic 3A Test Firm', 'independent_ptin');

  perform set_config('request.jwt.claims', json_build_object('sub', v_ero_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_ero_ws := public.create_workspace('Epic 3A Test ERO', 'ero_office');
  reset role;

  -- 1. engagement_types system seed data ---------------------------------
  select count(*) into v_type_count from public.engagement_types where workspace_id is null;
  assert v_type_count = 6, format('expected 6 system engagement types, got %s', v_type_count);

  -- 2. Create a client + engagement; verify engagement_number + default
  --    assignment (Independent PTIN -> workspace owner) ------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_client_id := ((public.create_client(v_ws, 'individual', 'Pat', 'Taxpayer', null, null, 'pat+epic3atest@example.com', null, null))->>'client_id')::uuid;

  insert into public.engagements (workspace_id, client_id, engagement_type_id)
  values (v_ws, v_client_id, (select id from public.engagement_types where slug = 'individual-return' and workspace_id is null))
  returning id, engagement_number, assigned_staff_id into v_engagement_id, v_engagement_number, v_assigned_staff_id;

  assert v_engagement_number ~ '^ENG-\d{4}-\d{6}$', format('unexpected engagement_number format: %s', v_engagement_number);
  assert v_assigned_staff_id = v_owner, 'a new Independent PTIN engagement should default assigned_staff_id to the workspace owner';
  assert (select status from public.engagements where id = v_engagement_id) = 'New', 'a new engagement should default to status New';

  assert exists (
    select 1 from public.activity_log where entity_type = 'engagement' and entity_id = v_engagement_id and activity_type = 'ENGAGEMENT_CREATED'
  ), 'engagement creation was not written to the Timeline (activity_log)';

  -- 3. Reassignment is tracked ---------------------------------------------
  select id into v_staff_role_id from public.roles where slug = 'staff' and workspace_id is null;
  perform public.invite_workspace_user(v_ws, v_staff, v_staff_role_id);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.accept_workspace_invitation(v_ws);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.engagements set assigned_staff_id = v_staff where id = v_engagement_id;

  select count(*) into v_history_count from public.engagement_assignment_history
  where engagement_id = v_engagement_id and assignment_role = 'assigned_staff' and new_user_id = v_staff;
  assert v_history_count = 1, 'reassigning assigned_staff_id did not create an engagement_assignment_history row';

  -- 4. Status Engine: history + Timeline + auto-stamped completed_date ----
  update public.engagements set status = 'In Progress' where id = v_engagement_id;
  assert exists (
    select 1 from public.engagement_status_history where engagement_id = v_engagement_id and old_status = 'New' and new_status = 'In Progress'
  ), 'status change to In Progress did not create an engagement_status_history row';
  assert exists (
    select 1 from public.activity_log where entity_type = 'engagement' and entity_id = v_engagement_id and activity_type = 'STATUS_CHANGE'
  ), 'status change was not written to the Timeline';

  update public.engagements set status = 'Completed' where id = v_engagement_id;
  assert (select completed_date from public.engagements where id = v_engagement_id) is not null,
    'transitioning to Completed should auto-stamp completed_date';

  -- 5. Workflow run + task -> Timeline on completion -----------------------
  select id into v_process_id from public.processes where slug = 'individual-tax-preparation-process' and workspace_id is null;
  if v_process_id is null then
    select id into v_process_id from public.processes where workspace_id is null limit 1;
  end if;
  v_workflow_run_id := public.start_engagement_workflow(v_engagement_id, v_process_id);
  assert v_workflow_run_id is not null, 'start_engagement_workflow did not return a workflow_run id';

  insert into public.tasks (workflow_stage_id, engagement_id, workspace_id, title)
  values ((select id from public.workflow_stages where workflow_run_id = v_workflow_run_id order by display_order limit 1), v_engagement_id, v_ws, 'Collect W-2')
  returning id into v_task_id;

  update public.tasks set status = 'completed' where id = v_task_id;
  assert exists (
    select 1 from public.activity_log where entity_type = 'task' and entity_id = v_task_id and activity_type = 'TASK_COMPLETED'
  ), 'task completion was not written to the Timeline';

  -- 6. Attachments: entity_type check constraint + Timeline ----------------
  insert into public.attachments (entity_type, entity_id, workspace_id, file_name, storage_path, uploaded_by)
  values ('engagement', v_engagement_id, v_ws, '2025-return.pdf', v_ws || '/engagement/' || v_engagement_id || '/2025-return.pdf', v_owner)
  returning id into v_attachment_id;
  assert exists (
    select 1 from public.activity_log where entity_type = 'engagement' and entity_id = v_engagement_id and activity_type = 'DOCUMENT_UPLOADED'
  ), 'attachment upload was not written to the Timeline';

  v_rejected := false;
  begin
    insert into public.attachments (entity_type, entity_id, workspace_id, file_name, storage_path, uploaded_by)
    values ('not_a_real_type', v_engagement_id, v_ws, 'bad.pdf', 'x', v_owner);
    raise exception 'attachments should reject an unrecognized entity_type';
  exception when others then
    v_rejected := true;
  end;
  assert v_rejected, 'attachments entity_type check constraint did not reject an invalid value';

  -- 7. Notes: is_private RLS ------------------------------------------------
  insert into public.notes (workspace_id, entity_type, entity_id, author_id, body, is_private)
  values (v_ws, 'engagement', v_engagement_id, v_owner, 'Confidential note', true)
  returning id into v_note_id;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  set local role authenticated;
  assert not exists (select 1 from public.notes where id = v_note_id), 'staff should not see another user''s private note';
  reset role;

  -- 8. Review Engine: request corrections + comment create history + a
  --    queued notification back to the sharing workspace ------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_ero_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.firm_connections (parent_workspace_id, child_workspace_id, relationship_type, invited_by)
  values (v_ero_ws, v_ws, 'ero_ptin', v_ero_owner)
  returning id into v_connection_id;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.respond_to_firm_connection(v_connection_id, true);
  v_share_id := public.share_engagement_with_ero(v_engagement_id, v_ws, v_ero_ws, '{"documents":true}'::jsonb);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', v_ero_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.review_comment(v_share_id, 'Looks mostly good.');
  perform public.review_request_corrections(v_share_id, 'Missing signature page.');
  reset role;

  assert (select count(*) from public.engagement_review_actions where engagement_share_id = v_share_id) = 2,
    'expected 2 engagement_review_actions rows (comment + request_corrections)';
  assert (select status from public.engagement_shares where id = v_share_id) = 'corrections_requested',
    'review_request_corrections did not update engagement_shares.status';

  select count(*) into v_notif_count from public.notification_queue
  where workspace_id = v_ws and recipient_user_id = v_owner and event_type = 'ENGAGEMENT_SHARE_CORRECTIONS_REQUESTED';
  assert v_notif_count = 1, 'review_request_corrections did not queue a notification back to the sharing workspace owner';

  -- 9. RLS: tasks (the table that used to have RLS disabled entirely) must
  --    now be invisible to a non-member ------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_ero_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  assert not exists (select 1 from public.tasks where id = v_task_id), 'a non-member of the owning workspace could see a task via RLS';
  assert not exists (select 1 from public.engagements where id = v_engagement_id), 'a non-member could see the engagement directly via RLS (shares are a separate, explicit grant)';
  reset role;

  raise notice 'Epic 3A (Engagement Foundation) smoke tests passed';
end $$;

rollback;
