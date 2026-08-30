-- Finishes the "hand back to VA" piece of ERO Review: dragging the card to
-- either Ready for Preparation or Missing Docs/Information already works
-- (those automations already exist and fire on entry). This adds the third
-- landing spot -- ERO declines the engagement -- as its own pipeline stage
-- with its own automation and its own (more specific, per Kryssie) email,
-- separate from the generic quote-decline/no-response disengagement notice.

-- 1. A more specific disengagement email for an ERO-level decline, distinct
--    from the generic "Disengagement Notice (General)" used for a declined
--    quote or an unresponsive client.
insert into public.email_templates (id, workspace_id, name, slug, subject, body_html, status)
values (
  'aa111111-1111-4111-8111-111111111101',
  '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7',
  'Disengagement Notice (ERO Review Declined)',
  'email_ero_review_declined',
  '{{firm_name}}: Update on your tax preparation engagement',
  '<p>Hi {{client_first_name}},</p><p>Thank you for trusting <strong>{{firm_name}} </strong>with your tax preparation.</p><p>After a thorough professional review of your documentation, we have determined that we are unable to move forward with preparing your return at this time, and your engagement with <strong>{{firm_name}} </strong>will be closed.</p><p>No further action is required from you.</p><p>If you have questions about this decision, please do not hesitate to reach out to our office directly.</p><p>We appreciate the opportunity to connect with you and wish you the best!</p><p>Thank you,</p><p><strong>{{firm_name}}</strong></p><p><em>Your financial future, organized</em></p>',
  'published'
);

-- 2. New pipeline stage -- the third place a card can land after ERO review,
--    alongside the two that already exist (Ready for Preparation, Missing
--    Docs/Information).
insert into public.process_stages (id, process_id, name, display_order)
values ('aa222222-2222-4222-8222-222222222202', '9fffcdfc-5b67-489b-80ed-a434d53b9792', 'Declined - ERO Review', 3);

-- 3. New automation, fires the moment a card lands on that stage.
insert into public.automations (id, workspace_id, name, slug, trigger_type, trigger_config, is_enabled, status)
values (
  'aa333333-3333-4333-8333-333333333303',
  '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7',
  'Individual/Sched C -- ERO Review Declined',
  'mkb-individual-sched-c-ero-review-declined',
  'lead.stage_entered',
  '{"process_id": "9fffcdfc-5b67-489b-80ed-a434d53b9792", "process_stage_id": "aa222222-2222-4222-8222-222222222202"}'::jsonb,
  true,
  'published'
);

insert into public.automation_steps (id, automation_id, display_order, action_type, display_name, action_config)
values
  ('aa444444-4444-4444-8444-444444444404', 'aa333333-3333-4333-8333-333333333303', 0, 'send_email', 'Email: ERO decline notice', '{"template_slug": "email_ero_review_declined"}'::jsonb),
  ('aa555555-5555-4555-8555-555555555505', 'aa333333-3333-4333-8333-333333333303', 1, 'mark_lead_lost', 'Mark lead lost', '{"reason": "Declined during ERO review"}'::jsonb),
  ('aa666666-6666-4666-8666-666666666606', 'aa333333-3333-4333-8333-333333333303', 2, 'add_tag', 'Tag: ERO Review - Declined', '{"tag": "ERO Review - Declined"}'::jsonb),
  ('aa777777-7777-4777-8777-777777777707', 'aa333333-3333-4333-8333-333333333303', 3, 'remove_tag', 'Remove tag: Needs ERO Review', '{"tag": "Needs ERO Review"}'::jsonb),
  ('aa888888-8888-4888-8888-888888888808', 'aa333333-3333-4333-8333-333333333303', 4, 'move_pipeline_stage', 'Move to: Add to nurturing cycle', '{"process_id": "2a5c8020-5770-4d82-9e9a-ef1bdd2fa009", "process_stage_id": "7a113d93-1826-4f10-92b9-388510719f87"}'::jsonb);

insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order)
values
  ('aa333333-3333-4333-8333-333333333303', 'aa444444-4444-4444-8444-444444444404', 'aa555555-5555-4555-8555-555555555505', null, null, 0),
  ('aa333333-3333-4333-8333-333333333303', 'aa555555-5555-4555-8555-555555555505', 'aa666666-6666-4666-8666-666666666606', null, null, 0),
  ('aa333333-3333-4333-8333-333333333303', 'aa666666-6666-4666-8666-666666666606', 'aa777777-7777-4777-8777-777777777707', null, null, 0),
  ('aa333333-3333-4333-8333-333333333303', 'aa777777-7777-4777-8777-777777777707', 'aa888888-8888-4888-8888-888888888808', null, null, 0);

-- 4. Clear "Needs ERO Review" the moment a card leaves that stage for either
--    of the other two landing spots, so it doesn't linger once ERO has
--    actually made a call.
insert into public.automation_steps (id, automation_id, display_order, action_type, display_name, action_config)
values
  ('bb111111-1111-4111-8111-111111111101', '78d3fe51-8f1e-4093-b80b-8bdc509c3fb3', 27, 'remove_tag', 'Remove tag: Needs ERO Review', '{"tag": "Needs ERO Review"}'::jsonb),
  ('bb222222-2222-4222-8222-222222222202', 'a761af2b-d421-47c7-a392-64d3e7641e24', 24, 'remove_tag', 'Remove tag: Needs ERO Review', '{"tag": "Needs ERO Review"}'::jsonb);

insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order)
values
  ('78d3fe51-8f1e-4093-b80b-8bdc509c3fb3', 'bb111111-1111-4111-8111-111111111101', 'f2b3c4d5-0001-4bbb-8ccc-dddd22223333', null, null, 0),
  ('a761af2b-d421-47c7-a392-64d3e7641e24', 'bb222222-2222-4222-8222-222222222202', 'e1a2b3c4-1111-4aaa-8bbb-cccc11112222', null, null, 0);

update public.automation_steps set canvas_x = null, canvas_y = null where automation_id in ('78d3fe51-8f1e-4093-b80b-8bdc509c3fb3', 'a761af2b-d421-47c7-a392-64d3e7641e24');

-- 5. Point the existing escalation task at Kryssie by name instead of
--    leaving it unassigned.
update public.automation_steps
set action_config = action_config || '{"assigned_staff_id": "817d1585-9c4f-448c-bc8c-b0c3e7a50904"}'::jsonb
where id = 'a02c850e-9349-43dc-9310-2325340f4837';
