-- Builds out the previously-empty "Individual/Sched C Prep Started" pipeline
-- (5 stages, zero automations behind any of them) that starts once a lead
-- converts to a client and lands in "Preparation Started". All 5 follow the
-- same drag-the-card pattern as the rest of this pipeline.

-- 1. Let create_task's assigned_staff_id resolve to "whoever currently owns
--    this client" instead of only a fixed staff id -- needed so the
--    Preparation Started task actually reaches the right preparer instead
--    of sitting unassigned. Surgical patch on the live function body so
--    nothing else about it can drift from a manual retype.
do $do$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(oid) into v_def
  from pg_proc where proname = 'execute_automation_step' and pronamespace = 'public'::regnamespace;

  v_new := replace(
    v_def,
    E'    select e.engagement_number, e.status, e.priority, e.service_id, c.first_name, c.last_name, c.primary_email, c.primary_phone,\n      c.sms_opt_out, c.email_opt_out\n    into v_eng',
    E'    select e.engagement_number, e.status, e.priority, e.service_id, c.first_name, c.last_name, c.primary_email, c.primary_phone,\n      c.sms_opt_out, c.email_opt_out, c.relationship_manager_id\n    into v_eng'
  );
  v_new := replace(
    v_new,
    E'    select null::text as engagement_number, null::text as status, null::text as priority, null::uuid as service_id,\n      c.first_name, c.last_name, c.primary_email, c.primary_phone, c.sms_opt_out, c.email_opt_out\n    into v_eng',
    E'    select null::text as engagement_number, null::text as status, null::text as priority, null::uuid as service_id,\n      c.first_name, c.last_name, c.primary_email, c.primary_phone, c.sms_opt_out, c.email_opt_out, c.relationship_manager_id\n    into v_eng'
  );
  v_new := replace(
    v_new,
    E'        nullif(v_step.action_config->>''assigned_staff_id'', '''')::uuid,\n        case when v_step.action_config ? ''due_in_days'' then now() + make_interval(days => (v_step.action_config->>''due_in_days'')::int) else null end,',
    E'        case when v_step.action_config->>''assigned_staff_id'' = ''client_relationship_manager'' then v_eng.relationship_manager_id\n             else nullif(v_step.action_config->>''assigned_staff_id'', '''')::uuid end,\n        case when v_step.action_config ? ''due_in_days'' then now() + make_interval(days => (v_step.action_config->>''due_in_days'')::int) else null end,'
  );

  if v_new = v_def then
    raise exception 'execute_automation_step: expected text not found for relationship-manager task sentinel patch';
  end if;

  execute v_new;
end;
$do$;

-- 2. Two new email templates.
insert into public.email_templates (id, workspace_id, name, slug, subject, body_html, status)
values
  (
    'c1000001-0000-4000-8000-000000000001',
    '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7',
    'Schedule Your Return Review',
    'schedule_return_review',
    '{{client_first_name}}, your return is almost ready -- let''s review it together',
    '<p>Hi {{client_first_name}},</p><p>Great news -- your preparer has finished working on your return, and it''s ready for a final review together.</p><p>Please log into your client portal to schedule a review appointment at a time that works for you: {{portal_link}}</p><p>During this appointment, we''ll walk through your completed return and answer any questions before you sign off.</p><p>Thank you,</p><p><strong>{{firm_name}}</strong></p><p><em>Your financial future, organized.</em></p>',
    'published'
  ),
  (
    'c1000002-0000-4000-8000-000000000002',
    '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7',
    'Return Signed - Thank You',
    'return_review_approved',
    'Thank you, {{client_first_name}} -- your return is complete!',
    '<p>Hi {{client_first_name}},</p><p>Thank you for reviewing and signing off on your completed return. We''re now finalizing everything to file with the IRS on your behalf.</p><p>No further action is needed from you at this time -- we''ll be in touch once your return has been filed.</p><p>Thank you for trusting <strong>{{firm_name}}</strong> with your taxes!</p><p>Sincerely,</p><p><strong>{{firm_name}}</strong></p><p><em>Your financial future, organized.</em></p>',
    'published'
  );

-- 3. Automation A: Preparation Started -- tag + assign the actual preparer
-- (the client relationship manager, now a real value thanks to the
-- auto-assignment engine).
insert into public.automations (id, workspace_id, name, slug, trigger_type, trigger_config, is_enabled, status)
values (
  'b1000001-0000-4000-8000-000000000001', '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7',
  'Individual/Sched C -- Preparation Started', 'mkb-individual-sched-c-preparation-started',
  'lead.stage_entered',
  '{"process_id": "d39f9c21-5bb5-45b7-966b-c40339946807", "process_stage_id": "be2484cb-eb72-46ac-8617-6b7fdbe4f698"}'::jsonb,
  true, 'published'
);
insert into public.automation_steps (id, automation_id, display_order, action_type, display_name, action_config)
values
  ('b1000001-0001-4000-8000-000000000001', 'b1000001-0000-4000-8000-000000000001', 0, 'add_tag', 'Tag: In Preparation', '{"tag": "In Preparation"}'::jsonb),
  ('b1000001-0002-4000-8000-000000000002', 'b1000001-0000-4000-8000-000000000001', 1, 'create_task', 'Task: Prepare the return',
   '{"title": "Prepare {{client_name}}''s return", "description": "Return preparation has started for {{client_name}}.", "assigned_staff_id": "client_relationship_manager", "due_in_days": "5", "priority": "medium"}'::jsonb);
insert into public.automation_step_edges (automation_id, from_step_id, to_step_id)
values ('b1000001-0000-4000-8000-000000000001', 'b1000001-0001-4000-8000-000000000001', 'b1000001-0002-4000-8000-000000000002');

-- 4. Automation B: Schedule Review Appointment -- invite the client to book
-- their review call, reusing the existing generic "we sent you an email"
-- SMS instead of building a near-duplicate.
insert into public.automations (id, workspace_id, name, slug, trigger_type, trigger_config, is_enabled, status)
values (
  'b1000002-0000-4000-8000-000000000002', '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7',
  'Individual/Sched C -- Schedule Review Appointment', 'mkb-individual-sched-c-schedule-review-appointment',
  'lead.stage_entered',
  '{"process_id": "d39f9c21-5bb5-45b7-966b-c40339946807", "process_stage_id": "d328b983-36b3-4a1b-ad81-debb9c01200a"}'::jsonb,
  true, 'published'
);
insert into public.automation_steps (id, automation_id, display_order, action_type, display_name, action_config)
values
  ('b1000002-0001-4000-8000-000000000001', 'b1000002-0000-4000-8000-000000000002', 0, 'send_email', 'Email: Schedule your review', '{"template_slug": "schedule_return_review"}'::jsonb),
  ('b1000002-0002-4000-8000-000000000002', 'b1000002-0000-4000-8000-000000000002', 1, 'send_sms', 'Text: Check your email', '{"template_slug": "we_ve_sent_you_an_email-3"}'::jsonb);
insert into public.automation_step_edges (automation_id, from_step_id, to_step_id)
values ('b1000002-0000-4000-8000-000000000002', 'b1000002-0001-4000-8000-000000000001', 'b1000002-0002-4000-8000-000000000002');

-- 5. Automation C: Client Review - Completed/Approved -- fires once the VA
-- drags the card here AFTER the client has actually signed off. Thanks the
-- client, hands off to e-filing, closes out the "In Preparation" tag.
insert into public.automations (id, workspace_id, name, slug, trigger_type, trigger_config, is_enabled, status)
values (
  'b1000003-0000-4000-8000-000000000003', '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7',
  'Individual/Sched C -- Client Review Approved', 'mkb-individual-sched-c-client-review-approved',
  'lead.stage_entered',
  '{"process_id": "d39f9c21-5bb5-45b7-966b-c40339946807", "process_stage_id": "4d64a140-91fc-4739-a29b-140f15ef9844"}'::jsonb,
  true, 'published'
);
insert into public.automation_steps (id, automation_id, display_order, action_type, display_name, action_config)
values
  ('b1000003-0001-4000-8000-000000000001', 'b1000003-0000-4000-8000-000000000003', 0, 'remove_tag', 'Remove tag: In Preparation', '{"tag": "In Preparation"}'::jsonb),
  ('b1000003-0002-4000-8000-000000000002', 'b1000003-0000-4000-8000-000000000003', 1, 'send_email', 'Email: Thank you, return complete', '{"template_slug": "return_review_approved"}'::jsonb),
  ('b1000003-0003-4000-8000-000000000003', 'b1000003-0000-4000-8000-000000000003', 2, 'create_task', 'Task: E-file the return',
   '{"title": "E-file {{client_name}}''s return", "description": "{{client_name}} has signed off -- ready to e-file.", "assigned_staff_id": "client_relationship_manager", "due_in_days": "2", "priority": "high"}'::jsonb);
insert into public.automation_step_edges (automation_id, from_step_id, to_step_id)
values
  ('b1000003-0000-4000-8000-000000000003', 'b1000003-0001-4000-8000-000000000001', 'b1000003-0002-4000-8000-000000000002'),
  ('b1000003-0000-4000-8000-000000000003', 'b1000003-0002-4000-8000-000000000002', 'b1000003-0003-4000-8000-000000000003');

-- 6. Automation D: Client Review - Needs Revision -- client asked for
-- changes on the call; preparer reworks it live, so this stays internal
-- only. Keeps the "In Preparation" tag since it's still being worked.
insert into public.automations (id, workspace_id, name, slug, trigger_type, trigger_config, is_enabled, status)
values (
  'b1000004-0000-4000-8000-000000000004', '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7',
  'Individual/Sched C -- Client Review Needs Revision', 'mkb-individual-sched-c-client-review-needs-revision',
  'lead.stage_entered',
  '{"process_id": "d39f9c21-5bb5-45b7-966b-c40339946807", "process_stage_id": "3b3011dc-c0c7-4399-9451-60c2e5ce23ba"}'::jsonb,
  true, 'published'
);
insert into public.automation_steps (id, automation_id, display_order, action_type, display_name, action_config)
values
  ('b1000004-0001-4000-8000-000000000001', 'b1000004-0000-4000-8000-000000000004', 0, 'create_task', 'Task: Revise the return',
   '{"title": "Revise {{client_name}}''s return per client feedback", "description": "Client requested changes during their review appointment.", "assigned_staff_id": "client_relationship_manager", "due_in_days": "2", "priority": "high"}'::jsonb);

-- 7. Automation E: Client Review - Declined Filing -- client saw the
-- finished return and decided not to proceed. Same disengage pattern as
-- Missing Info / ERO Review: notice, mark lost, tag, move to nurturing.
insert into public.automations (id, workspace_id, name, slug, trigger_type, trigger_config, is_enabled, status)
values (
  'b1000005-0000-4000-8000-000000000005', '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7',
  'Individual/Sched C -- Client Review Declined Filing', 'mkb-individual-sched-c-client-review-declined-filing',
  'lead.stage_entered',
  '{"process_id": "d39f9c21-5bb5-45b7-966b-c40339946807", "process_stage_id": "27715158-eb05-4927-a1ff-758985f0f74c"}'::jsonb,
  true, 'published'
);
insert into public.automation_steps (id, automation_id, display_order, action_type, display_name, action_config)
values
  ('b1000005-0001-4000-8000-000000000001', 'b1000005-0000-4000-8000-000000000005', 0, 'remove_tag', 'Remove tag: In Preparation', '{"tag": "In Preparation"}'::jsonb),
  ('b1000005-0002-4000-8000-000000000002', 'b1000005-0000-4000-8000-000000000005', 1, 'send_email', 'Email: Disengagement notice', '{"template_slug": "email_quote_rejected"}'::jsonb),
  ('b1000005-0003-4000-8000-000000000003', 'b1000005-0000-4000-8000-000000000005', 2, 'mark_lead_lost', 'Mark lead lost', '{"reason": "Declined filing after reviewing completed return"}'::jsonb),
  ('b1000005-0004-4000-8000-000000000004', 'b1000005-0000-4000-8000-000000000005', 3, 'add_tag', 'Tag: Declined - Post Prep', '{"tag": "Declined - Post Prep"}'::jsonb),
  ('b1000005-0005-4000-8000-000000000005', 'b1000005-0000-4000-8000-000000000005', 4, 'move_pipeline_stage', 'Move to: Add to nurturing cycle',
   '{"process_id": "2a5c8020-5770-4d82-9e9a-ef1bdd2fa009", "process_stage_id": "7a113d93-1826-4f10-92b9-388510719f87"}'::jsonb);
insert into public.automation_step_edges (automation_id, from_step_id, to_step_id)
values
  ('b1000005-0000-4000-8000-000000000005', 'b1000005-0001-4000-8000-000000000001', 'b1000005-0002-4000-8000-000000000002'),
  ('b1000005-0000-4000-8000-000000000005', 'b1000005-0002-4000-8000-000000000002', 'b1000005-0003-4000-8000-000000000003'),
  ('b1000005-0000-4000-8000-000000000005', 'b1000005-0003-4000-8000-000000000003', 'b1000005-0004-4000-8000-000000000004'),
  ('b1000005-0000-4000-8000-000000000005', 'b1000005-0004-4000-8000-000000000004', 'b1000005-0005-4000-8000-000000000005');
