-- Finishes wiring "New Leads Enter CRM" past its organizer-status
-- condition, per the owner's answers:
--   - Skip the 24h reminder if the organizer was already completed during
--     the wait -- recheck first, only send the reminder if still pending.
--   - Completed (at any of the 3 check points) -> start the shared
--     "Organizer Completed Follow-up" automation (staff notify + move to
--     service pipeline + 24-business-hour escalation clock).
--   - Still pending after the second 24h wait (following the reminder) ->
--     move to the "Lead Stalled- No Organizer" pipeline and start the
--     "Lead Stalled- No Organizer" automation.
--
-- Also fixes two real bugs found while doing this, both pre-dating this
-- migration:
--   1. The original "Organizer Pending" branch (edge 38cf3210) ANDed two
--      equality checks against the same field with two different literal
--      values ("not_started" AND "in_progress") -- a condition that can
--      never be true, since evaluate_automation_conditions' default join
--      is 'and' unless a condition explicitly sets "join":"or". That
--      silently dead-ended the entire automation for the overwhelmingly
--      common case (organizer not yet submitted) right after the very
--      first check. Fixed by using an explicit "submitted" check ahead of
--      it (sort_order 0) plus a null-branch_conditions catch-all for
--      everything else (sort_order 1) -- the same safe pattern already
--      used successfully elsewhere in this automation, avoiding the
--      AND-of-mutually-exclusive-equalities trap entirely.
--   2. The recheck condition step (ebc15050) had no edge at all for
--      "organizer got submitted during the 24h wait" -- only a
--      null-branch_conditions edge, which (since null always matches
--      first) meant every recheck routed to "still pending" unconditionally,
--      regardless of actual status. Fixed the same way as #1.

do $$
declare
  v_automation_id uuid := 'f0cf2f59-df2f-438d-b501-9d0c535f0e5b';
  v_pending_edge_id uuid := '38cf3210-02ec-4da8-a1c7-6079716b768a';
  v_completed_edge_id uuid := 'f1188b2b-bc8c-4404-8008-22f774fc996f';
  v_first_recheck_condition_id uuid := 'ebc15050-7e7e-4524-bb00-1a1310814c4f';
  v_first_recheck_still_pending_edge_id uuid := 'a21cb02d-ccc1-41bc-bb07-aae88aebafcb';
  v_stale_move_to_service_step_id uuid := '8bca6867-e702-4e76-80b6-03db7168ff2c';
  v_move_to_stalled_pipeline_step_id uuid := '75d2281c-9b0d-43df-87bf-a4927b923651';
  v_followup_automation_id uuid := 'a1cedcb0-6e33-4ed0-9a5e-322684f9b7d2'; -- Organizer Completed Follow-up
  v_reminder_email_step_id uuid;
  v_reminder_sms_step_id uuid;
  v_second_delay_step_id uuid;
  v_second_recheck_condition_id uuid;
  v_start_followup_step_id uuid;
begin
  -- New steps for the reminder + second 24h wait + second recheck.
  insert into public.automation_steps (id, automation_id, display_order, action_type, action_config)
  values (gen_random_uuid(), v_automation_id, 16, 'send_email',
    jsonb_build_object('template_slug', 'organizer-reminder-1-email', 'organizer_template_id', 'current_run'))
  returning id into v_reminder_email_step_id;

  insert into public.automation_steps (id, automation_id, display_order, action_type, action_config)
  values (gen_random_uuid(), v_automation_id, 17, 'send_sms',
    jsonb_build_object('template_slug', 'organizer-reminder-1-sms', 'organizer_template_id', 'current_run'))
  returning id into v_reminder_sms_step_id;

  insert into public.automation_steps (id, automation_id, display_order, action_type, action_config, delay_minutes)
  values (gen_random_uuid(), v_automation_id, 18, 'delay', '{"delay_unit": "days"}'::jsonb, 1440)
  returning id into v_second_delay_step_id;

  insert into public.automation_steps (id, automation_id, display_order, action_type, action_config)
  values (gen_random_uuid(), v_automation_id, 19, 'condition', '{}'::jsonb)
  returning id into v_second_recheck_condition_id;

  -- Single step to start "Organizer Completed Follow-up" -- every
  -- completed-organizer resolution point (initial check, first recheck,
  -- second recheck) routes into this same step.
  insert into public.automation_steps (id, automation_id, display_order, action_type, action_config)
  values (gen_random_uuid(), v_automation_id, 20, 'start_workflow', jsonb_build_object('automation_id', v_followup_automation_id))
  returning id into v_start_followup_step_id;

  -- Fix #1: the original condition dead-end -- make it an explicit
  -- catch-all instead of an unreachable AND of two literal values.
  update public.automation_step_edges
  set branch_conditions = null
  where id = v_pending_edge_id;

  -- Route "organizer completed" (initial check) to the shared follow-up.
  update public.automation_step_edges
  set to_step_id = v_start_followup_step_id
  where id = v_completed_edge_id;

  -- Fix #2: give the first recheck a real "still pending" catch-all
  -- (instead of an always-true null edge with no submitted-check
  -- counterpart), now pointing at the reminder instead of straight to the
  -- stalled pipeline.
  update public.automation_step_edges
  set to_step_id = v_reminder_email_step_id, branch_conditions = null
  where id = v_first_recheck_still_pending_edge_id;

  -- Fix #2 continued: the missing "organizer got submitted during the
  -- first 24h wait" edge.
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order)
  values (
    v_automation_id, v_first_recheck_condition_id, v_start_followup_step_id,
    jsonb_build_array(jsonb_build_object('conditions', jsonb_build_array(jsonb_build_object('op', 'eq', 'field', 'client.organizer_status', 'value', 'current_run|submitted')))),
    'Organizer Submitted', 0
  );

  -- Reminder -> second 24h wait -> second recheck.
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order)
  values (v_automation_id, v_reminder_email_step_id, v_reminder_sms_step_id, 0);
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order)
  values (v_automation_id, v_reminder_sms_step_id, v_second_delay_step_id, 0);
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order)
  values (v_automation_id, v_second_delay_step_id, v_second_recheck_condition_id, 0);

  -- Second recheck: submitted -> follow-up; still pending -> stalled pipeline move (existing step, reused).
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order)
  values (
    v_automation_id, v_second_recheck_condition_id, v_start_followup_step_id,
    jsonb_build_array(jsonb_build_object('conditions', jsonb_build_array(jsonb_build_object('op', 'eq', 'field', 'client.organizer_status', 'value', 'current_run|submitted')))),
    'Organizer Submitted', 0
  );
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order)
  values (v_automation_id, v_second_recheck_condition_id, v_move_to_stalled_pipeline_step_id, null, 'Still Pending', 1);

  -- The move-to-service-pipeline step this automation used to do inline is
  -- now the follow-up automation's job instead -- drop the now-orphaned row.
  delete from public.automation_steps where id = v_stale_move_to_service_step_id;
end $$;
