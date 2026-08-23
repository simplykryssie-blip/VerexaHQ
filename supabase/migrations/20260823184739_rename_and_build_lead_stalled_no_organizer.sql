-- Owner's exact naming, applied everywhere: both the terminal pipeline and
-- its automation are named "Lead Stalled- No Organizer" (not "Pending
-- Organizer Pipeline" / "Waiting on Organizer Completion (New Lead)" as
-- first built). Renames the existing rows rather than creating new ones so
-- the ids New Leads Enter CRM already wires into stay valid, and gives the
-- automation its first real steps (it previously had none -- "its own
-- steps are still being built separately", per the prior migration).

update public.processes
set name = 'Lead Stalled- No Organizer', slug = 'lead-stalled-no-organizer'
where id = '7c3c843d-e8c5-47f6-94d4-8a2396198314';

update public.automations
set name = 'Lead Stalled- No Organizer', slug = 'lead-stalled-no-organizer',
    description = 'Started only via start_workflow from New Leads Enter CRM once a lead has gone 48+ hours (24h wait, reminder, another 24h wait) with no organizer submitted.'
where id = '3556bcce-fe13-4217-a07f-96cbfe2097ff';

do $$
declare
  v_automation_id uuid := '3556bcce-fe13-4217-a07f-96cbfe2097ff';
  v_task_step_id uuid;
  v_notify_step_id uuid;
  v_tag_step_id uuid;
begin
  insert into public.automation_steps (id, automation_id, display_order, action_type, action_config)
  values (gen_random_uuid(), v_automation_id, 0, 'create_task',
    jsonb_build_object('title', 'Lead stalled -- organizer never completed', 'description', 'This lead has had no organizer submission for 48+ hours. Needs manual outreach.', 'priority', 'high', 'due_in_days', 1))
  returning id into v_task_step_id;

  insert into public.automation_steps (id, automation_id, display_order, action_type, action_config)
  values (gen_random_uuid(), v_automation_id, 1, 'send_notification',
    jsonb_build_object('channels', jsonb_build_array('In-App', 'Email'), 'message', '{{client_name}} has stalled with no organizer completed after 48 hours -- needs manual follow-up.', 'priority', 'High'))
  returning id into v_notify_step_id;

  insert into public.automation_steps (id, automation_id, display_order, action_type, action_config)
  values (gen_random_uuid(), v_automation_id, 2, 'add_tag', jsonb_build_object('tag', 'stalled-no-organizer'))
  returning id into v_tag_step_id;

  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order)
  values (v_automation_id, v_task_step_id, v_notify_step_id, 0);
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order)
  values (v_automation_id, v_notify_step_id, v_tag_step_id, 0);
end $$;
