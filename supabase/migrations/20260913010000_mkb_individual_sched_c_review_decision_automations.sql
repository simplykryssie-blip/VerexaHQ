-- Wires the three Organizer Review decisions (Approve / Need Info / Deny)
-- to actually move the Individual/Sched C Onboarding pipeline card, using
-- the organizer_response.review_decided trigger that already exists and
-- already fires from set_organizer_response_review_status -- it just had
-- no automations configured against it yet. Each automation is a single
-- move_pipeline_stage step; everything downstream (the document-chase
-- sequence on Missing Docs/Information, the disengagement email on
-- Declined - ERO Review) is already built and fires on its own via the
-- existing lead.stage_entered automations the moment the card lands there.
insert into public.automations (id, workspace_id, name, slug, trigger_type, trigger_config, conditions, is_enabled, status)
values
  ('cc111111-1111-4111-8111-111111111101', '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7', '4. Individual/Sched C -- Review Approved', 'mkb-individual-sched-c-review-approved', 'organizer_response.review_decided', '{"to_status": "Approved", "organizer_template_id": "6951abd2-6705-4e92-be7a-17a9a1292692"}'::jsonb, '[{"conditions": []}]'::jsonb, true, 'published'),
  ('cc222222-2222-4222-8222-222222222202', '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7', '5. Individual/Sched C -- Needs Info Requested', 'mkb-individual-sched-c-needs-info-requested', 'organizer_response.review_decided', '{"to_status": "Corrections Requested", "organizer_template_id": "6951abd2-6705-4e92-be7a-17a9a1292692"}'::jsonb, '[{"conditions": []}]'::jsonb, true, 'published'),
  ('cc333333-3333-4333-8333-333333333303', '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7', '6. Individual/Sched C -- Review Denied', 'mkb-individual-sched-c-review-denied', 'organizer_response.review_decided', '{"to_status": "Rejected", "organizer_template_id": "6951abd2-6705-4e92-be7a-17a9a1292692"}'::jsonb, '[{"conditions": []}]'::jsonb, true, 'published')
on conflict (id) do nothing;

insert into public.automation_steps (id, automation_id, display_order, action_type, display_name, action_config)
values
  ('cc444444-4444-4444-8444-444444444404', 'cc111111-1111-4111-8111-111111111101', 0, 'move_pipeline_stage', 'Move to: Ready for Preparation', '{"process_id": "9fffcdfc-5b67-489b-80ed-a434d53b9792", "process_stage_id": "53fab371-77ca-4b8a-a795-b0a7b8bae88d"}'::jsonb),
  ('cc555555-5555-4555-8555-555555555505', 'cc222222-2222-4222-8222-222222222202', 0, 'move_pipeline_stage', 'Move to: Missing Docs/Information', '{"process_id": "9fffcdfc-5b67-489b-80ed-a434d53b9792", "process_stage_id": "f73e3103-181c-4201-8f0c-2eee042c2209"}'::jsonb),
  ('cc666666-6666-4666-8666-666666666606', 'cc333333-3333-4333-8333-333333333303', 0, 'move_pipeline_stage', 'Move to: Declined - ERO Review', '{"process_id": "9fffcdfc-5b67-489b-80ed-a434d53b9792", "process_stage_id": "aa222222-2222-4222-8222-222222222202"}'::jsonb)
on conflict (id) do nothing;
