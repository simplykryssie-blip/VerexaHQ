-- Wires "New Leads Enter CRM" past its organizer-status condition, per
-- the owner's design:
--
-- Organizer Completed -> move the lead onto the pipeline matching their
--   selected service (move_lead_to_service_pipeline -- auto-resolved,
--   not hardcoded to one service).
-- Organizer Pending -> wait 24h -> recheck the same condition ->
--   - now submitted -> same move-to-service-pipeline step as above
--   - still pending -> move the lead onto the new Pending Organizer
--     Pipeline, then start the "Waiting on Organizer Completion (New
--     Lead)" automation (its own steps are still being built separately).
--
-- Removes the old dead-end "wait until submitted, 2-day timeout" step
-- that the Organizer Completed branch pointed at -- redundant now that
-- the condition already confirms submission before this branch is ever
-- taken.

do $$
declare
  v_automation_id uuid := 'f0cf2f59-df2f-438d-b501-9d0c535f0e5b';
  v_condition_step_id uuid := 'f83210c8-a74d-4174-b9a1-56e7110f5cbf';
  v_completed_edge_id uuid := 'f1188b2b-bc8c-4404-8008-22f774fc996f';
  v_pending_edge_id uuid := '38cf3210-02ec-4da8-a1c7-6079716b768a';
  v_old_dead_end_step_id uuid := '8db173fb-a41c-4c37-993f-1ac3f2c86e5f';
  v_pending_organizer_process_id uuid := '7c3c843d-e8c5-47f6-94d4-8a2396198314';
  v_pending_organizer_stage_id uuid := 'c73f573d-0c6d-4b1e-a0c1-429bf0cee6f7';
  v_waiting_automation_id uuid := '3556bcce-fe13-4217-a07f-96cbfe2097ff';
  v_move_to_service_step_id uuid;
  v_recheck_delay_step_id uuid;
  v_recheck_condition_step_id uuid;
  v_move_to_pending_step_id uuid;
  v_start_waiting_workflow_step_id uuid;
begin
  delete from public.automation_steps where id = v_old_dead_end_step_id;

  insert into public.automation_steps (id, automation_id, display_order, action_type, action_config)
  values (gen_random_uuid(), v_automation_id, 10, 'move_lead_to_service_pipeline', '{}'::jsonb)
  returning id into v_move_to_service_step_id;

  insert into public.automation_steps (id, automation_id, display_order, action_type, action_config, delay_minutes)
  values (gen_random_uuid(), v_automation_id, 11, 'delay', '{"delay_unit": "days"}'::jsonb, 1440)
  returning id into v_recheck_delay_step_id;

  insert into public.automation_steps (id, automation_id, display_order, action_type, action_config)
  values (gen_random_uuid(), v_automation_id, 12, 'condition', '{}'::jsonb)
  returning id into v_recheck_condition_step_id;

  insert into public.automation_steps (id, automation_id, display_order, action_type, action_config)
  values (gen_random_uuid(), v_automation_id, 13, 'move_lead_stage', jsonb_build_object('process_id', v_pending_organizer_process_id, 'process_stage_id', v_pending_organizer_stage_id))
  returning id into v_move_to_pending_step_id;

  insert into public.automation_steps (id, automation_id, display_order, action_type, action_config)
  values (gen_random_uuid(), v_automation_id, 14, 'start_workflow', jsonb_build_object('automation_id', v_waiting_automation_id))
  returning id into v_start_waiting_workflow_step_id;

  update public.automation_step_edges set to_step_id = v_move_to_service_step_id where id = v_completed_edge_id;
  update public.automation_step_edges set to_step_id = v_recheck_delay_step_id where id = v_pending_edge_id;

  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order)
  values (v_automation_id, v_recheck_delay_step_id, v_recheck_condition_step_id, 0);

  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order)
  values (
    v_automation_id, v_recheck_condition_step_id, v_move_to_service_step_id,
    jsonb_build_array(jsonb_build_object('conditions', jsonb_build_array(jsonb_build_object('op', 'eq', 'field', 'client.organizer_status', 'value', 'current_run|submitted')))),
    'Organizer Submitted', 0
  );

  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order)
  values (v_automation_id, v_recheck_condition_step_id, v_move_to_pending_step_id, null, 'Still Pending', 1);

  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order)
  values (v_automation_id, v_move_to_pending_step_id, v_start_waiting_workflow_step_id, 0);
end $$;
