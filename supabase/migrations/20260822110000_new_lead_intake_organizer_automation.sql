-- Builds "New Lead Intake & Organizer" (trigger: a new lead is created) and
-- its companion "Organizer Submitted -- Move to Review" (trigger: an
-- organizer is submitted, scoped to the Individual/Schedule C organizer).
--
-- These were split from the user's single-automation design because a lead
-- is now always captured *before* any organizer could be submitted (early
-- capture at the public organizer's Contact step, built earlier this
-- session) -- so "check whether the lead already submitted an organizer"
-- at creation time can never be true. The two real trigger points already
-- in the system (lead.created, organizer.submitted) map cleanly onto what
-- was originally drawn as one automation with an impossible branch.
--
-- Both are created with is_enabled = false -- review the copy and the
-- "Assign Lead owner" step (defaulted to the only current staff member,
-- verexahq@gmail.com) in the Workflows builder before turning them on,
-- since this sends real email/SMS to real leads.
do $$
declare
  v_workspace_id uuid := '74321fb2-9a18-4625-ab12-01c98e888667';
  v_process_id uuid := '7906554d-0cf0-4e50-b79d-66c175c8aac9';
  v_stage_new uuid := 'f9bd2ede-182d-404d-ad82-0e0a6ddb6063';
  v_stage_organizer_required uuid := '3e469b3e-81d2-43eb-8b7e-2b81928c0899';
  v_stage_organizer_review uuid := '8a6e6da3-c394-4887-bda7-761c82ddeb1d';
  v_organizer_template_id uuid := '5be259fe-dc43-4e46-8825-cce1ba34e90e';
  v_owner_staff_id uuid := '94161e3f-ce7e-4626-8d0d-abef5350cf7c';

  v_automation_a_id uuid;
  v_automation_b_id uuid;

  v_s1 uuid; v_s2 uuid; v_s3 uuid; v_s4 uuid; v_s5 uuid;
  v_c1 uuid; v_s6 uuid; v_s7 uuid;
  v_c2 uuid; v_s8 uuid;
  v_c3 uuid; v_s9 uuid;
  v_s10 uuid;

  v_b1 uuid; v_b2 uuid; v_b3 uuid; v_b4 uuid;

  v_reminder_conditions jsonb := jsonb_build_array(
    jsonb_build_object('field', 'lead.process_stage_id', 'op', 'eq', 'value', v_stage_organizer_required::text),
    jsonb_build_object('field', 'client.lifecycle_status', 'op', 'eq', 'value', 'lead'),
    jsonb_build_object('field', 'client.tags', 'op', 'neq', 'value', 'Needs Nurture')
  );
begin
  -- Email templates
  insert into public.email_templates (workspace_id, name, slug, category, subject, body_html, status) values
  (v_workspace_id, 'Organizer Required', 'organizer-required-email', 'lead_intake',
   'Your next step: complete your tax organizer',
   '<p>Hello {{first_name}},</p>' ||
   '<p>Thank you for choosing Verexa Tax Office.</p>' ||
   '<p>Your next step is to complete your secure tax organizer.</p>' ||
   '<p>Your organizer helps us understand your tax situation, determine the services you need, and identify the information we''ll need before your consultation.</p>' ||
   '<p><a href="{{organizer_link}}">Complete Your Organizer</a></p>' ||
   '<p>Please provide as much information as possible. If a question does not apply to you, simply indicate that it does not apply.</p>' ||
   '<p><strong>What happens after you submit it?</strong></p>' ||
   '<p>1. We review your organizer<br>Our team will review your information within 24 business hours.</p>' ||
   '<p>2. We schedule your consultation<br>We''ll contact you to schedule a consultation.</p>' ||
   '<p>3. We review your tax situation and quote<br>We''ll discuss your situation, recommended services, and preparation fee.</p>' ||
   '<p>4. If you accept the quote<br>We''ll send your engagement letter and begin the next step of your tax preparation process.</p>' ||
   '<p>If you have questions while completing the organizer, contact us at {{office_phone}} or {{office_email}}.</p>' ||
   '<p>We look forward to working with you.</p>' ||
   '<p>Verexa Tax Office<br>{{office_phone}}<br>{{office_email}}</p>',
   'published'),
  (v_workspace_id, 'Organizer Received', 'organizer-received-email', 'lead_intake',
   'We received your tax organizer',
   '<p>Hello {{first_name}},</p>' ||
   '<p>Thank you for choosing Verexa Tax Office.</p>' ||
   '<p>We received your tax organizer and the information you provided for your {{tax_year}} tax return.</p>' ||
   '<p>Our team will review your information within 24 business hours. During this review, we''ll evaluate your tax situation, confirm the services you need, identify any questions or additional information we may need, and prepare for your consultation.</p>' ||
   '<p><strong>What happens next?</strong></p>' ||
   '<p>1. We review your organizer<br>Our team will review the information you submitted.</p>' ||
   '<p>2. We schedule your consultation<br>Once the review is complete, you''ll receive an invitation to schedule your consultation.</p>' ||
   '<p>3. We discuss your return and quote<br>During your consultation, we''ll review your tax situation, recommended services, and preparation fee.</p>' ||
   '<p>4. If you accept the quote<br>We''ll send your engagement letter and explain what additional information and documents we''ll need.</p>' ||
   '<p>For now, there is nothing else you need to do unless our team contacts you for additional information.</p>' ||
   '<p>Thank you for choosing Verexa Tax Office. We look forward to working with you.</p>' ||
   '<p>Verexa Tax Office<br>{{office_phone}}<br>{{office_email}}</p>',
   'published'),
  (v_workspace_id, 'Organizer Reminder 1', 'organizer-reminder-1-email', 'lead_intake',
   'Don''t forget your tax organizer',
   '<p>Hi {{first_name}},</p>' ||
   '<p>Just a quick reminder -- we haven''t yet received your tax organizer for your {{tax_year}} return. Completing it helps us get your consultation scheduled and your quote ready.</p>' ||
   '<p><a href="{{organizer_link}}">Complete Your Organizer</a></p>' ||
   '<p>If you have any questions, reach us at {{office_phone}} or {{office_email}}.</p>' ||
   '<p>Verexa Tax Office</p>',
   'published'),
  (v_workspace_id, 'Organizer Reminder 2', 'organizer-reminder-2-email', 'lead_intake',
   'Still need your tax organizer',
   '<p>Hi {{first_name}},</p>' ||
   '<p>We still haven''t received your completed tax organizer for your {{tax_year}} return. We want to make sure we have everything ready for your consultation and quote -- completing your organizer is the next step.</p>' ||
   '<p><a href="{{organizer_link}}">Complete Your Organizer</a></p>' ||
   '<p>Questions? Call us at {{office_phone}} or email {{office_email}}.</p>' ||
   '<p>Verexa Tax Office</p>',
   'published');

  -- SMS templates
  insert into public.sms_templates (workspace_id, name, slug, body, status) values
  (v_workspace_id, 'Organizer Required', 'organizer-required-sms',
   'Hi {{first_name}}! Welcome to Verexa Tax Office. Your next step is to complete your secure tax organizer: {{organizer_link}}. Once submitted, we''ll review it within 24 business hours and contact you to schedule your consultation. -- Verexa Tax Office',
   'published'),
  (v_workspace_id, 'Organizer Received', 'organizer-received-sms',
   'Hi {{first_name}}! We received your {{tax_year}} tax organizer. Our team will review it within 24 business hours. Once reviewed, we''ll contact you to schedule your consultation and go over your quote. -- Verexa Tax Office',
   'published'),
  (v_workspace_id, 'Organizer Reminder 1', 'organizer-reminder-1-sms',
   'Hi {{first_name}}, reminder from Verexa Tax Office -- please complete your {{tax_year}} tax organizer when you get a chance: {{organizer_link}}',
   'published'),
  (v_workspace_id, 'Organizer Reminder 3', 'organizer-reminder-3-sms',
   'Hi {{first_name}}, this is a final reminder from Verexa Tax Office to complete your {{tax_year}} tax organizer: {{organizer_link}}. Let us know if you need help!',
   'published');

  -- Automation A: New Lead Intake & Organizer
  insert into public.automations (workspace_id, name, slug, trigger_type, trigger_config, conditions, is_enabled, status)
  values (v_workspace_id, 'New Lead Intake & Organizer', 'new-lead-intake-organizer', 'lead.created', '{}'::jsonb, '[]'::jsonb, false, 'published')
  returning id into v_automation_a_id;

  insert into public.automation_steps (automation_id, action_type, action_config, display_order)
  values (v_automation_a_id, 'move_lead_stage', jsonb_build_object('process_id', v_process_id, 'process_stage_id', v_stage_organizer_required), 0)
  returning id into v_s1;

  insert into public.automation_steps (automation_id, action_type, action_config, display_order)
  values (v_automation_a_id, 'assign_user', jsonb_build_object('target', 'client', 'staff_id', v_owner_staff_id), 1)
  returning id into v_s2;

  insert into public.automation_steps (automation_id, action_type, action_config, display_order)
  values (v_automation_a_id, 'create_task', jsonb_build_object(
    'title', 'Complete Client Organizer',
    'description', E'Checklist:\n- Complete all applicable organizer questions\n- Provide accurate information\n- Review responses\n- Submit organizer',
    'due_in_days', 1,
    'priority', 'high'
  ), 2)
  returning id into v_s3;

  insert into public.automation_steps (automation_id, action_type, action_config, display_order)
  values (v_automation_a_id, 'send_email', jsonb_build_object('template_slug', 'organizer-required-email', 'organizer_template_id', v_organizer_template_id), 3)
  returning id into v_s4;

  insert into public.automation_steps (automation_id, action_type, action_config, display_order)
  values (v_automation_a_id, 'send_sms', jsonb_build_object('template_slug', 'organizer-required-sms', 'organizer_template_id', v_organizer_template_id), 4)
  returning id into v_s5;

  insert into public.automation_steps (automation_id, action_type, action_config, display_order, delay_minutes)
  values (v_automation_a_id, 'condition', '{}'::jsonb, 5, 2880)
  returning id into v_c1;

  insert into public.automation_steps (automation_id, action_type, action_config, display_order)
  values (v_automation_a_id, 'send_email', jsonb_build_object('template_slug', 'organizer-reminder-1-email', 'organizer_template_id', v_organizer_template_id), 6)
  returning id into v_s6;

  insert into public.automation_steps (automation_id, action_type, action_config, display_order)
  values (v_automation_a_id, 'send_sms', jsonb_build_object('template_slug', 'organizer-reminder-1-sms', 'organizer_template_id', v_organizer_template_id), 7)
  returning id into v_s7;

  insert into public.automation_steps (automation_id, action_type, action_config, display_order, delay_minutes)
  values (v_automation_a_id, 'condition', '{}'::jsonb, 8, 2880)
  returning id into v_c2;

  insert into public.automation_steps (automation_id, action_type, action_config, display_order)
  values (v_automation_a_id, 'send_email', jsonb_build_object('template_slug', 'organizer-reminder-2-email', 'organizer_template_id', v_organizer_template_id), 9)
  returning id into v_s8;

  insert into public.automation_steps (automation_id, action_type, action_config, display_order, delay_minutes)
  values (v_automation_a_id, 'condition', '{}'::jsonb, 10, 4320)
  returning id into v_c3;

  insert into public.automation_steps (automation_id, action_type, action_config, display_order)
  values (v_automation_a_id, 'send_sms', jsonb_build_object('template_slug', 'organizer-reminder-3-sms', 'organizer_template_id', v_organizer_template_id), 11)
  returning id into v_s9;

  insert into public.automation_steps (automation_id, action_type, action_config, display_order)
  values (v_automation_a_id, 'create_task', jsonb_build_object(
    'title', 'Follow up with unresponsive lead',
    'description', 'This lead has not completed their tax organizer after 3 reminders. Reach out personally to check in and see if they still want to move forward, or tag as Needs Nurture.',
    'assigned_staff_id', v_owner_staff_id,
    'priority', 'high'
  ), 12)
  returning id into v_s10;

  -- Straight-line edges
  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order) values
  (v_automation_a_id, v_s1, v_s2, 0), (v_automation_a_id, v_s2, v_s3, 0), (v_automation_a_id, v_s3, v_s4, 0),
  (v_automation_a_id, v_s4, v_s5, 0), (v_automation_a_id, v_s5, v_c1, 0),
  (v_automation_a_id, v_c1, v_s6, 0),
  (v_automation_a_id, v_s6, v_s7, 0), (v_automation_a_id, v_s7, v_c2, 0),
  (v_automation_a_id, v_c2, v_s8, 0),
  (v_automation_a_id, v_s8, v_c3, 0),
  (v_automation_a_id, v_c3, v_s9, 0),
  (v_automation_a_id, v_s9, v_s10, 0);

  -- The above wiring lists c1->s6, c2->s8, c3->s9 as plain unconditional
  -- edges (sort_order 0) so INSERT above always has exactly one row per
  -- from_step_id at that point; update them to carry the actual "still
  -- needs to submit" branch_conditions, so start_next_automation_step only
  -- continues into the next reminder when the lead genuinely still hasn't
  -- submitted (still on Organizer Required, still a lead, not tagged
  -- Needs Nurture). If the conditions don't match, there's no other edge
  -- to fall back to, so the run cleanly stops there.
  update public.automation_step_edges set branch_conditions = v_reminder_conditions where from_step_id = v_c1 and to_step_id = v_s6;
  update public.automation_step_edges set branch_conditions = v_reminder_conditions where from_step_id = v_c2 and to_step_id = v_s8;
  update public.automation_step_edges set branch_conditions = v_reminder_conditions where from_step_id = v_c3 and to_step_id = v_s9;

  -- Automation B: Organizer Submitted -> Move to Review
  insert into public.automations (workspace_id, name, slug, trigger_type, trigger_config, conditions, is_enabled, status)
  values (
    v_workspace_id, 'Organizer Submitted -- Move to Review', 'organizer-submitted-move-to-review', 'organizer.submitted',
    jsonb_build_object('organizer_template_id', v_organizer_template_id), '[]'::jsonb, false, 'published'
  )
  returning id into v_automation_b_id;

  insert into public.automation_steps (automation_id, action_type, action_config, display_order)
  values (v_automation_b_id, 'move_lead_stage', jsonb_build_object('process_id', v_process_id, 'process_stage_id', v_stage_organizer_review), 0)
  returning id into v_b1;

  insert into public.automation_steps (automation_id, action_type, action_config, display_order)
  values (v_automation_b_id, 'create_task', jsonb_build_object(
    'title', 'Review Client Organizer',
    'description', E'Checklist:\n- Review client information\n- Review requested service(s)\n- Review tax year\n- Review filing status\n- Review dependents\n- Review income information\n- Review Schedule C/business information\n- Identify missing information\n- Identify potential complexity\n- Determine services required\n- Determine consultation requirements\n- Determine quote\n- Complete organizer review',
    'assigned_staff_id', v_owner_staff_id,
    'due_in_days', 1,
    'priority', 'high'
  ), 1)
  returning id into v_b2;

  insert into public.automation_steps (automation_id, action_type, action_config, display_order)
  values (v_automation_b_id, 'send_email', jsonb_build_object('template_slug', 'organizer-received-email'), 2)
  returning id into v_b3;

  insert into public.automation_steps (automation_id, action_type, action_config, display_order)
  values (v_automation_b_id, 'send_sms', jsonb_build_object('template_slug', 'organizer-received-sms'), 3)
  returning id into v_b4;

  insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order) values
  (v_automation_b_id, v_b1, v_b2, 0), (v_automation_b_id, v_b2, v_b3, 0), (v_automation_b_id, v_b3, v_b4, 0);
end $$;
