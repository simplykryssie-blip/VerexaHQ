-- New shared automation: whenever a lead's organizer comes back completed
-- (whether that's caught on the first 5-min check or on either 24h
-- recheck in "New Leads Enter CRM"), start this one instead of duplicating
-- the same 4 steps in three places. Per the owner's design:
--   "a notification goes to the staff member and a 24hr business hour
--    clock starts... escalate if staff hasn't acted in 24 business hours"
-- "Acted" = the lead has been assigned a relationship_manager_id -- the
-- existing signal every other assignment action in this app already
-- writes to, checked via the condition system's existing
-- client.relationship_manager_id/is_null support.
--
-- trigger_type is set but deliberately never able to auto-fire (this
-- automation is only ever started explicitly via a start_workflow step)
-- -- same defensive convention already used by the pre-existing
-- "Waiting on Organizer Completion (New Lead)" automation, so a lead
-- passing through here can never accidentally get a second, duplicate run.

do $$
declare
  v_workspace_id uuid := '74321fb2-9a18-4625-ab12-01c98e888667';
  v_automation_id uuid;
  v_notify_step_id uuid;
  v_move_step_id uuid;
  v_bh_delay_step_id uuid;
  v_condition_step_id uuid;
  v_escalate_step_id uuid;
  v_no_escalation_note_step_id uuid;
begin
  insert into public.automations (id, workspace_id, name, slug, description, trigger_type, trigger_config, is_enabled, status)
  values (
    gen_random_uuid(), v_workspace_id, 'Organizer Completed Follow-up', 'organizer-completed-followup',
    'Started only via start_workflow from New Leads Enter CRM (any of its 3 organizer-completed branches). Notifies staff, moves the lead onto its service pipeline, and escalates if no staff member has taken ownership within 24 business hours.',
    'engagement.status_changed', jsonb_build_object('to_status', 'New'), false, 'published'
  )
  returning id into v_automation_id;

  insert into public.automation_steps (id, automation_id, display_order, action_type, action_config)
  values (gen_random_uuid(), v_automation_id, 0, 'send_notification',
    jsonb_build_object('channels', jsonb_build_array('In-App', 'Email'), 'message', '{{client_name}} completed their intake organizer -- time to review and reach out.', 'priority', 'Medium'))
  returning id into v_notify_step_id;

  insert into public.automation_steps (id, automation_id, display_order, action_type, action_config)
  values (gen_random_uuid(), v_automation_id, 1, 'move_lead_to_service_pipeline', '{}'::jsonb)
  returning id into v_move_step_id;

  insert into public.automation_steps (id, automation_id, display_order, action_type, action_config)
  values (gen_random_uuid(), v_automation_id, 2, 'business_hours_delay', jsonb_build_object('hours', 24))
  returning id into v_bh_delay_step_id;

  insert into public.automation_steps (id, automation_id, display_order, action_type, action_config)
  values (gen_random_uuid(), v_automation_id, 3, 'condition', '{}'::jsonb)
  returning id into v_condition_step_id;

  insert into public.automation_steps (id, automation_id, display_order, action_type, action_config)
  values (gen_random_uuid(), v_automation_id, 4, 'send_notification',
    jsonb_build_object('channels', jsonb_build_array('In-App', 'Email'), 'message', '{{client_name}} has had no staff follow-up within 1 business day of their organizer being completed.', 'priority', 'High'))
  returning id into v_escalate_step_id;

  insert into public.automation_steps (id, automation_id, display_order, action_type, action_config)
  values (gen_random_uuid(), v_automation_id, 5, 'add_note', jsonb_build_object('body', 'Lead was already assigned within 1 business day of organizer completion -- no escalation needed.'))
  returning id into v_no_escalation_note_step_id;

  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order)
  values (v_automation_id, v_notify_step_id, v_move_step_id, 0);
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order)
  values (v_automation_id, v_move_step_id, v_bh_delay_step_id, 0);
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order)
  values (v_automation_id, v_bh_delay_step_id, v_condition_step_id, 0);

  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order)
  values (
    v_automation_id, v_condition_step_id, v_escalate_step_id,
    jsonb_build_array(jsonb_build_object('conditions', jsonb_build_array(jsonb_build_object('op', 'is_null', 'field', 'client.relationship_manager_id')))),
    'Unassigned', 0
  );
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order)
  values (
    v_automation_id, v_condition_step_id, v_no_escalation_note_step_id,
    jsonb_build_array(jsonb_build_object('conditions', jsonb_build_array(jsonb_build_object('op', 'is_not_null', 'field', 'client.relationship_manager_id')))),
    'Already Assigned', 1
  );
end $$;
