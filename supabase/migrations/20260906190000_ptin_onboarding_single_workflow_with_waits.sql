-- Rebuilds PTIN Onboarding as ONE continuous automation instead of one
-- automation per pipeline stage. The previous design existed because a
-- "lead.stage_entered" trigger can only ever fire a fresh automation run,
-- never resume one -- but a running automation can pause indefinitely at a
-- human checkpoint and resume itself once a condition becomes true, via:
--   - a 'delay' step with action_config.wait_mode = 'until_condition'
--     (re-checked every minute by the run-pending-automation-steps cron,
--     see 20260822190000_wait_until_date_or_condition_delay_modes.sql)
--   - a 'condition' step with action_config.retry_until_matched = true
--     (same polling machinery, see
--     20260904060000_condition_step_retry_until_matched.sql)
-- That's the real "1 workflow with conditions" shape a tax pro building
-- this by hand would expect, and it's what this migration builds:
--
--   trigger (Application Received) -> tag, email, task
--   -> WAIT until the card is moved to "Call Completed" (staff drags it --
--      lead.process_stage_id is checked live, no extra tagging needed)
--   -> contract-coming email, send contract, auto-advance the card to
--      "Contract Sent" (move_pipeline_stage, not a wait -- nothing needs
--      staff judgment here)
--   -> WAIT (retry_until_matched) for whichever of the Independent PTIN /
--      Workspace PTIN tags staff adds after the call -> branch
--   -> both branches converge, then WAIT until the card reaches
--      "Account Created"
--   -> welcome-message task, tag them an active partner
--
-- The pipeline's 4 stages stay exactly as they were for the Kanban board;
-- only "Onboarding Call Scheduled" is renamed to "Call Completed" since
-- that's the real checkpoint the wait is keyed on. Tags, email templates,
-- the renamed service, the contract template, and the placeholder Learning
-- Hub course from the previous migration are all reused unchanged.

do $$
declare
  v_workspace_id uuid := 'b53cc047-e1dd-4a6e-92f4-88b3c37f48af'; -- Ascend Tax Office
  v_process_id uuid := '42669909-fb0f-4016-b261-0d2b5d3b3004';
  v_stage_application uuid := 'c5fce2d7-2c6a-43a3-92d5-43906080292c';
  v_stage_call_completed uuid := 'ec5ce42e-b9bf-4bd2-b22c-d3fd2e4bf2b3'; -- was "Onboarding Call Scheduled"
  v_stage_contract_sent uuid := '0828e214-1f17-42e8-857f-89c5be23d680';
  v_stage_account_created uuid := '9c52f0e9-820a-4069-95d5-5c5085df60ca';
  v_contract_template_id uuid := '59f2a304-a2e3-4413-a7f4-b49133350652';

  v_automation_id uuid;
  v_prev uuid;
  v_step uuid;
  v_condition_step uuid;
  v_indep_last uuid;
  v_ws_last uuid;
  v_converge_step uuid;
begin
  update public.process_stages set name = 'Call Completed' where id = v_stage_call_completed;

  -- Remove the old one-automation-per-stage design entirely.
  delete from public.automation_step_edges
    where automation_id in (select id from public.automations where workspace_id = v_workspace_id and name like 'PTIN Onboarding --%');
  delete from public.automation_steps
    where automation_id in (select id from public.automations where workspace_id = v_workspace_id and name like 'PTIN Onboarding --%');
  delete from public.automations where workspace_id = v_workspace_id and name like 'PTIN Onboarding --%';

  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, conditions, is_enabled, status)
  values (
    v_workspace_id, 'PTIN Onboarding', 'ptin-onboarding',
    'One continuous workflow covering the full PTIN partner recruiting flow: application through account creation, pausing at each human checkpoint (call completed, path tag, account created) and resuming automatically once the pipeline card or tag reflects it.',
    'lead.stage_entered', jsonb_build_object('process_id', v_process_id, 'process_stage_id', v_stage_application), '[]'::jsonb, true, 'published'
  ) returning id into v_automation_id;

  -- 1-3: tag, schedule-call email, follow-up task
  insert into public.automation_steps (automation_id, display_order, action_type, action_config)
  values (v_automation_id, 1, 'add_tag', jsonb_build_object('tag', 'PTIN Prospect')) returning id into v_prev;

  insert into public.automation_steps (automation_id, display_order, action_type, action_config)
  values (v_automation_id, 2, 'send_email', jsonb_build_object('template_slug', 'ptin-onboarding-schedule-call')) returning id into v_step;
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order) values (v_automation_id, v_prev, v_step, 0);
  v_prev := v_step;

  insert into public.automation_steps (automation_id, display_order, action_type, action_config)
  values (
    v_automation_id, 3, 'create_task',
    jsonb_build_object('title', 'Follow up if {{client_name}} hasn''t scheduled their PTIN Onboarding call', 'priority', 'medium', 'due_in_days', '3')
  ) returning id into v_step;
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order) values (v_automation_id, v_prev, v_step, 0);
  v_prev := v_step;

  -- 4: WAIT until staff moves the card to "Call Completed"
  insert into public.automation_steps (automation_id, display_order, action_type, action_config, display_name)
  values (
    v_automation_id, 4, 'delay',
    jsonb_build_object(
      'wait_mode', 'until_condition',
      'wait_conditions', jsonb_build_array(jsonb_build_object('conditions', jsonb_build_array(jsonb_build_object('field', 'lead.process_stage_id', 'op', 'eq', 'value', v_stage_call_completed::text)))),
      'wait_timeout_days', 90
    ),
    'Wait until Call Completed'
  ) returning id into v_step;
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order) values (v_automation_id, v_prev, v_step, 0);
  v_prev := v_step;

  -- 5-7: contract-coming email, send contract, auto-advance the card
  insert into public.automation_steps (automation_id, display_order, action_type, action_config)
  values (v_automation_id, 5, 'send_email', jsonb_build_object('template_slug', 'ptin-onboarding-contract-coming')) returning id into v_step;
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order) values (v_automation_id, v_prev, v_step, 0);
  v_prev := v_step;

  insert into public.automation_steps (automation_id, display_order, action_type, action_config)
  values (v_automation_id, 6, 'send_engagement_letter', jsonb_build_object('engagement_letter_template_id', v_contract_template_id)) returning id into v_step;
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order) values (v_automation_id, v_prev, v_step, 0);
  v_prev := v_step;

  insert into public.automation_steps (automation_id, display_order, action_type, action_config)
  values (v_automation_id, 7, 'move_pipeline_stage', jsonb_build_object('process_id', v_process_id, 'process_stage_id', v_stage_contract_sent)) returning id into v_step;
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order) values (v_automation_id, v_prev, v_step, 0);
  v_prev := v_step;

  -- 8: condition step, keeps retrying until staff tags Independent PTIN or Workspace PTIN
  insert into public.automation_steps (automation_id, display_order, action_type, action_config, display_name)
  values (v_automation_id, 8, 'condition', jsonb_build_object('retry_until_matched', true, 'retry_timeout_days', 90), 'Independent PTIN or Workspace PTIN?')
  returning id into v_condition_step;
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order) values (v_automation_id, v_prev, v_condition_step, 0);

  -- Independent PTIN branch
  insert into public.automation_steps (automation_id, display_order, action_type, action_config)
  values (v_automation_id, 9, 'send_email', jsonb_build_object('template_slug', 'ptin-onboarding-independent-instructions')) returning id into v_step;
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order)
  values (
    v_automation_id, v_condition_step, v_step,
    jsonb_build_array(jsonb_build_object('conditions', jsonb_build_array(jsonb_build_object('field', 'client.tags', 'op', 'eq', 'value', 'Independent PTIN')))),
    'Independent PTIN', 0
  );
  insert into public.automation_steps (automation_id, display_order, action_type, action_config)
  values (
    v_automation_id, 10, 'create_task',
    jsonb_build_object('title', 'Generate a firm-connection invite and send it to {{client_name}} to set up their independent Verexa workspace', 'priority', 'high', 'due_in_days', '1')
  ) returning id into v_indep_last;
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order) values (v_automation_id, v_step, v_indep_last, 0);

  -- Workspace PTIN branch
  insert into public.automation_steps (automation_id, display_order, action_type, action_config)
  values (v_automation_id, 11, 'send_email', jsonb_build_object('template_slug', 'ptin-onboarding-workspace-invite-instructions')) returning id into v_step;
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order)
  values (
    v_automation_id, v_condition_step, v_step,
    jsonb_build_array(jsonb_build_object('conditions', jsonb_build_array(jsonb_build_object('field', 'client.tags', 'op', 'eq', 'value', 'Workspace PTIN')))),
    'Workspace PTIN', 1
  );
  insert into public.automation_steps (automation_id, display_order, action_type, action_config)
  values (
    v_automation_id, 12, 'create_task',
    jsonb_build_object('title', 'Send {{client_name}} a workspace invite (PTIN Preparer role) from Settings > Users', 'priority', 'high', 'due_in_days', '1')
  ) returning id into v_ws_last;
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order) values (v_automation_id, v_step, v_ws_last, 0);

  -- Both branches converge here: WAIT until staff moves the card to "Account Created"
  insert into public.automation_steps (automation_id, display_order, action_type, action_config, display_name)
  values (
    v_automation_id, 13, 'delay',
    jsonb_build_object(
      'wait_mode', 'until_condition',
      'wait_conditions', jsonb_build_array(jsonb_build_object('conditions', jsonb_build_array(jsonb_build_object('field', 'lead.process_stage_id', 'op', 'eq', 'value', v_stage_account_created::text)))),
      'wait_timeout_days', 180
    ),
    'Wait until Account Created'
  ) returning id into v_converge_step;
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order) values (v_automation_id, v_indep_last, v_converge_step, 0);
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order) values (v_automation_id, v_ws_last, v_converge_step, 0);

  -- Final: welcome-message reminder + mark them active
  insert into public.automation_steps (automation_id, display_order, action_type, action_config)
  values (
    v_automation_id, 14, 'create_task',
    jsonb_build_object('title', 'Send {{client_name}} a welcome message in Messages with Learning Hub training links (see "PTIN Onboarding Training" course)', 'priority', 'medium', 'due_in_days', '0')
  ) returning id into v_step;
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order) values (v_automation_id, v_converge_step, v_step, 0);
  v_prev := v_step;

  insert into public.automation_steps (automation_id, display_order, action_type, action_config)
  values (v_automation_id, 15, 'add_tag', jsonb_build_object('tag', 'Active PTIN Partner')) returning id into v_step;
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order) values (v_automation_id, v_prev, v_step, 0);
  v_prev := v_step;

  insert into public.automation_steps (automation_id, display_order, action_type, action_config)
  values (v_automation_id, 16, 'remove_tag', jsonb_build_object('tag', 'PTIN Prospect')) returning id into v_step;
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order) values (v_automation_id, v_prev, v_step, 0);
end $$;
