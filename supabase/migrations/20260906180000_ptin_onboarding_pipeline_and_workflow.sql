-- Replaces the unused "PTIN Recruiting Pipeline" in the Ascend Tax Office
-- demo workspace (0 clients / 0 pipeline runs ever touched it) with the
-- exact PTIN Onboarding flow requested: Application Received -> Onboarding
-- Call Scheduled -> Contract Sent -> (branch on Independent PTIN vs
-- Workspace PTIN tag) -> Account Created.
--
-- Stage advancement is manual throughout (staff clicks to move a lead
-- forward), matching the pattern the old pipeline already used for every
-- one of its 6 automations -- these are real-world checkpoints ("did they
-- book the call", "did the call happen", "did they sign") that need a
-- human to confirm, not something the platform can detect on its own.
--
-- One known gap, called out rather than silently worked around: there is
-- no automation trigger for "a workspace invitation or firm-connection
-- invite was accepted" anywhere in this codebase, and no action_type sends
-- into internal_messages/network_messages. So the final "push them a
-- Messages welcome with Learning Hub links" step can't fire itself the
-- moment an account is created -- it's a create_task reminder on the
-- "Account Created" stage instead, for staff to send once they confirm the
-- signup, same manual-checkpoint pattern as the rest of this pipeline.

do $$
declare
  v_workspace_id uuid := 'b53cc047-e1dd-4a6e-92f4-88b3c37f48af'; -- Ascend Tax Office (demo-ero-office)
  v_old_process_id uuid := 'd606d91d-3528-40ff-a443-96100b8e3b13'; -- old "PTIN Recruiting Pipeline"
  v_service_id uuid := 'e8215a9f-788c-423c-9231-8950e261a56a'; -- "ERO Partnership Onboarding" -> renamed below
  v_contract_template_id uuid := '59f2a304-a2e3-4413-a7f4-b49133350652'; -- existing "ERO Partnership Agreement"

  v_process_id uuid;
  v_stage_application uuid;
  v_stage_call_scheduled uuid;
  v_stage_contract_sent uuid;
  v_stage_account_created uuid;

  v_course_id uuid;

  v_automation_id uuid;
  v_step1 uuid;
  v_step2 uuid;
  v_condition_step uuid;
  v_indep_step1 uuid;
  v_indep_step2 uuid;
  v_ws_step1 uuid;
  v_ws_step2 uuid;
  v_fallback_step uuid;
begin
  -- 1. Remove the old, unused, structurally-different pipeline + its automations ----
  delete from public.automation_step_edges
    where automation_id in (select id from public.automations where trigger_config->>'process_id' = v_old_process_id::text);
  delete from public.automation_steps
    where automation_id in (select id from public.automations where trigger_config->>'process_id' = v_old_process_id::text);
  delete from public.automations where trigger_config->>'process_id' = v_old_process_id::text;
  delete from public.process_stages where process_id = v_old_process_id;
  delete from public.processes where id = v_old_process_id;
  delete from public.email_templates where workspace_id = v_workspace_id and slug like 'ptin-recruiting-%';
  delete from public.sms_templates where workspace_id = v_workspace_id and slug like 'ptin-recruiting-%';

  -- 2. Rename/repurpose the existing service into the bookable "PTIN Onboarding" call ----
  update public.services set
    name = 'PTIN Onboarding',
    slug = 'ptin-onboarding',
    description = 'A short onboarding call to walk a new PTIN partner through joining Ascend Tax Office and get the ERO Partnership Agreement signed.',
    is_bookable = true,
    is_portal_visible = true,
    estimated_duration_minutes = 30
  where id = v_service_id;

  -- 3. Tags used by the branch condition ----
  insert into public.workspace_tags (workspace_id, name) values
    (v_workspace_id, 'PTIN Prospect'),
    (v_workspace_id, 'Independent PTIN'),
    (v_workspace_id, 'Workspace PTIN'),
    (v_workspace_id, 'Active PTIN Partner')
  on conflict (workspace_id, name) do nothing;

  -- 4. New pipeline (process) + 4 stages ----
  insert into public.processes (workspace_id, name, slug, description, status, is_lead_funnel)
  values (
    v_workspace_id, 'PTIN Onboarding Pipeline', 'ptin-onboarding-pipeline',
    'Recruits and onboards a new PTIN partner from application through account creation.',
    'published', true
  )
  returning id into v_process_id;

  insert into public.process_stages (process_id, name, display_order, completion_rule)
  values (v_process_id, 'Application Received', 1, 'manual_only') returning id into v_stage_application;
  insert into public.process_stages (process_id, name, display_order, completion_rule)
  values (v_process_id, 'Onboarding Call Scheduled', 2, 'manual_only') returning id into v_stage_call_scheduled;
  insert into public.process_stages (process_id, name, display_order, completion_rule)
  values (v_process_id, 'Contract Sent', 3, 'manual_only') returning id into v_stage_contract_sent;
  insert into public.process_stages (process_id, name, display_order, completion_rule)
  values (v_process_id, 'Account Created', 4, 'manual_only') returning id into v_stage_account_created;

  -- 5. Placeholder Learning Hub course for the final step to reference ----
  -- (no video content exists yet anywhere on the platform -- this gives the
  -- welcome-message task a real course to point to; upload actual videos
  -- into it before relying on this live.)
  insert into public.learning_courses (owner_workspace_id, title, description, status, display_order)
  values (v_workspace_id, 'PTIN Onboarding Training', 'Getting-started videos for newly onboarded PTIN partners.', 'published', 1)
  returning id into v_course_id;

  insert into public.learning_modules (course_id, module_type, title, display_order, body)
  values (
    v_course_id, 'lesson', 'Welcome to Ascend Tax Office', 1,
    'An introduction to how the ERO partnership works and what to expect in your first 30 days. (Placeholder -- replace with a real recorded video.)'
  );

  -- 6. Email templates ----
  insert into public.email_templates (workspace_id, name, slug, category, subject, body_html) values
  (
    v_workspace_id, 'PTIN Onboarding -- Schedule Call', 'ptin-onboarding-schedule-call', 'recruiting',
    'Let''s schedule your PTIN Onboarding call',
    '<p>Hi {{client_first_name}},</p><p>Thanks for applying to partner with Ascend Tax Office as a PTIN preparer! The next step is a quick PTIN Onboarding call so we can walk through how the partnership works and answer any questions.</p><p><a href="https://verexahq.com/book/demo-ero-office?service=' || v_service_id::text || '">Click here to schedule your PTIN Onboarding call</a></p><p>Talk soon,<br/>{{sender_name}}</p>'
  ),
  (
    v_workspace_id, 'PTIN Onboarding -- Contract Coming', 'ptin-onboarding-contract-coming', 'recruiting',
    'Next step -- your ERO Partnership Agreement',
    '<p>Hi {{client_first_name}},</p><p>Great talking with you on your PTIN Onboarding call! We''re sending over the ERO Partnership Agreement for your signature next so we can formalize the partnership.</p><p>Best,<br/>{{sender_name}}</p>'
  ),
  (
    v_workspace_id, 'PTIN Onboarding -- Independent PTIN Instructions', 'ptin-onboarding-independent-instructions', 'recruiting',
    'Next step: connecting your independent PTIN account',
    '<p>Hi {{client_first_name}},</p><p>You''re almost there. Since you''re joining as an independent PTIN, you''ll keep your own Verexa workspace, clients, and billing -- Ascend Tax Office simply connects to it as your ERO.</p><p>You''ll receive a separate connection invite email shortly. If you don''t already have a Verexa account, that same invite will walk you through creating one; if you do, just log in and accept it. Once accepted, your workspace links to Ascend Tax Office while staying fully independent otherwise.</p><p>Best,<br/>{{sender_name}}</p>'
  ),
  (
    v_workspace_id, 'PTIN Onboarding -- Workspace PTIN Instructions', 'ptin-onboarding-workspace-invite-instructions', 'recruiting',
    'Your Verexa workspace invite is on its way',
    '<p>Hi {{client_first_name}},</p><p>You''re almost there. Since you''re joining Ascend Tax Office''s workspace directly, you''ll receive a separate invite email to create your Verexa login as a seat on our team, with a PTIN Preparer role.</p><p>Once you accept it you''ll have access to your dashboard, clients, and the tools you need to get started.</p><p>Best,<br/>{{sender_name}}</p>'
  );

  -- 7. Automation: Application Received ----
  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, conditions, is_enabled, status)
  values (
    v_workspace_id, 'PTIN Onboarding -- Application Received', 'ptin-onboarding-application-received',
    'Tags the new PTIN applicant, sends them the call-scheduling link, and reminds staff to follow up.',
    'lead.stage_entered', jsonb_build_object('process_id', v_process_id, 'process_stage_id', v_stage_application), '[]'::jsonb, true, 'published'
  ) returning id into v_automation_id;

  insert into public.automation_steps (automation_id, display_order, action_type, action_config)
  values (v_automation_id, 1, 'add_tag', jsonb_build_object('tag', 'PTIN Prospect')) returning id into v_step1;
  insert into public.automation_steps (automation_id, display_order, action_type, action_config)
  values (v_automation_id, 2, 'send_email', jsonb_build_object('template_slug', 'ptin-onboarding-schedule-call')) returning id into v_step2;
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order) values (v_automation_id, v_step1, v_step2, 0);

  insert into public.automation_steps (automation_id, display_order, action_type, action_config)
  values (
    v_automation_id, 3, 'create_task',
    jsonb_build_object('title', 'Follow up if {{client_name}} hasn''t scheduled their PTIN Onboarding call', 'priority', 'medium', 'due_in_days', '3')
  ) returning id into v_step1;
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order) values (v_automation_id, v_step2, v_step1, 0);

  -- 8. Automation: Onboarding Call Scheduled ----
  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, conditions, is_enabled, status)
  values (
    v_workspace_id, 'PTIN Onboarding -- Call Scheduled', 'ptin-onboarding-call-scheduled',
    'Reminds staff to make sure the PTIN Onboarding call happens as scheduled.',
    'lead.stage_entered', jsonb_build_object('process_id', v_process_id, 'process_stage_id', v_stage_call_scheduled), '[]'::jsonb, true, 'published'
  ) returning id into v_automation_id;

  insert into public.automation_steps (automation_id, display_order, action_type, action_config)
  values (
    v_automation_id, 1, 'create_task',
    jsonb_build_object('title', 'Confirm {{client_name}}''s PTIN Onboarding call happens as scheduled', 'priority', 'medium', 'due_in_days', '1')
  );

  -- 9. Automation: Contract Sent (branches on Independent PTIN vs Workspace PTIN tag) ----
  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, conditions, is_enabled, status)
  values (
    v_workspace_id, 'PTIN Onboarding -- Contract Sent', 'ptin-onboarding-contract-sent',
    'Sends the ERO Partnership Agreement for signature, then branches on whichever of the Independent PTIN / Workspace PTIN tags staff added after the call.',
    'lead.stage_entered', jsonb_build_object('process_id', v_process_id, 'process_stage_id', v_stage_contract_sent), '[]'::jsonb, true, 'published'
  ) returning id into v_automation_id;

  insert into public.automation_steps (automation_id, display_order, action_type, action_config)
  values (v_automation_id, 1, 'send_email', jsonb_build_object('template_slug', 'ptin-onboarding-contract-coming')) returning id into v_step1;
  insert into public.automation_steps (automation_id, display_order, action_type, action_config)
  values (v_automation_id, 2, 'send_engagement_letter', jsonb_build_object('engagement_letter_template_id', v_contract_template_id)) returning id into v_step2;
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order) values (v_automation_id, v_step1, v_step2, 0);

  insert into public.automation_steps (automation_id, display_order, action_type, action_config)
  values (v_automation_id, 3, 'condition', '{}'::jsonb) returning id into v_condition_step;
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order) values (v_automation_id, v_step2, v_condition_step, 0);

  -- Independent PTIN branch
  insert into public.automation_steps (automation_id, display_order, action_type, action_config)
  values (v_automation_id, 4, 'send_email', jsonb_build_object('template_slug', 'ptin-onboarding-independent-instructions')) returning id into v_indep_step1;
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order)
  values (
    v_automation_id, v_condition_step, v_indep_step1,
    jsonb_build_array(jsonb_build_object('conditions', jsonb_build_array(jsonb_build_object('field', 'client.tags', 'op', 'eq', 'value', 'Independent PTIN')))),
    'Independent PTIN', 0
  );
  insert into public.automation_steps (automation_id, display_order, action_type, action_config)
  values (
    v_automation_id, 5, 'create_task',
    jsonb_build_object('title', 'Generate a firm-connection invite and send it to {{client_name}} to set up their independent Verexa workspace', 'priority', 'high', 'due_in_days', '1')
  ) returning id into v_indep_step2;
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order) values (v_automation_id, v_indep_step1, v_indep_step2, 0);

  -- Workspace PTIN branch
  insert into public.automation_steps (automation_id, display_order, action_type, action_config)
  values (v_automation_id, 6, 'send_email', jsonb_build_object('template_slug', 'ptin-onboarding-workspace-invite-instructions')) returning id into v_ws_step1;
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order)
  values (
    v_automation_id, v_condition_step, v_ws_step1,
    jsonb_build_array(jsonb_build_object('conditions', jsonb_build_array(jsonb_build_object('field', 'client.tags', 'op', 'eq', 'value', 'Workspace PTIN')))),
    'Workspace PTIN', 1
  );
  insert into public.automation_steps (automation_id, display_order, action_type, action_config)
  values (
    v_automation_id, 7, 'create_task',
    jsonb_build_object('title', 'Send {{client_name}} a workspace invite (PTIN Preparer role) from Settings > Users', 'priority', 'high', 'due_in_days', '1')
  ) returning id into v_ws_step2;
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order) values (v_automation_id, v_ws_step1, v_ws_step2, 0);

  -- Fallback: neither tag set yet (null branch_conditions = else, tried last)
  insert into public.automation_steps (automation_id, display_order, action_type, action_config)
  values (
    v_automation_id, 8, 'create_task',
    jsonb_build_object('title', 'Add an "Independent PTIN" or "Workspace PTIN" tag to {{client_name}} so onboarding knows which path to send', 'priority', 'high', 'due_in_days', '0')
  ) returning id into v_fallback_step;
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order)
  values (v_automation_id, v_condition_step, v_fallback_step, null, 'No path tag set', 2);

  -- 10. Automation: Account Created ----
  insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, conditions, is_enabled, status)
  values (
    v_workspace_id, 'PTIN Onboarding -- Account Created', 'ptin-onboarding-account-created',
    'Reminds staff to send the new partner a Messages welcome with Learning Hub training links, and marks them an active partner.',
    'lead.stage_entered', jsonb_build_object('process_id', v_process_id, 'process_stage_id', v_stage_account_created), '[]'::jsonb, true, 'published'
  ) returning id into v_automation_id;

  insert into public.automation_steps (automation_id, display_order, action_type, action_config)
  values (
    v_automation_id, 1, 'create_task',
    jsonb_build_object('title', 'Send {{client_name}} a welcome message in Messages with Learning Hub training links (see "PTIN Onboarding Training" course)', 'priority', 'medium', 'due_in_days', '0')
  ) returning id into v_step1;
  insert into public.automation_steps (automation_id, display_order, action_type, action_config)
  values (v_automation_id, 2, 'add_tag', jsonb_build_object('tag', 'Active PTIN Partner')) returning id into v_step2;
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order) values (v_automation_id, v_step1, v_step2, 0);

  insert into public.automation_steps (automation_id, display_order, action_type, action_config)
  values (v_automation_id, 3, 'remove_tag', jsonb_build_object('tag', 'PTIN Prospect')) returning id into v_step1;
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order) values (v_automation_id, v_step2, v_step1, 0);
end $$;
