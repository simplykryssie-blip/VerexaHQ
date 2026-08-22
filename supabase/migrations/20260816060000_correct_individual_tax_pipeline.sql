-- The user manually cleared the broken 6-stage "Individual Tax pipeline"
-- and its 3 automations (audit_log confirms: deleted by them at
-- 2026-08-16 10:56-10:57, ~2 hours before this fix), leaving one orphaned
-- "Filed / Delivered" stage. 0 workflow_runs/engagements ever referenced
-- this process, so it's safe to rebuild from scratch.
--
-- Corrected structure per the actual business process: organizer/quote/
-- lead-conversion all happen BEFORE an engagement exists (pre-engagement
-- intake, out of scope for this table), so the engagement pipeline now
-- starts at "Engagement Accepted" and never sends an organizer. Added
-- "Document Review" (QC checkpoint after Document Collection, before
-- Preparation) and "Ready to File" (checkpoint after Client Review,
-- before Filed). Split "Filed / Delivered" into "Filed" and
-- "Accepted / Complete". Renamed "Review" to "Client Review" to
-- disambiguate from Document Review, and folded "Client Approval" into
-- Client Review itself rather than keeping it a separate disconnected
-- stage.
delete from public.process_stages where id = '5d5d2d12-5258-40cb-acf8-1dc1df654e81';

insert into public.process_stages (process_id, name, display_order, engagement_letter_template_id, document_request_template_id)
values
  ('9fffcdfc-5b67-489b-80ed-a434d53b9792', 'Engagement Accepted', 0, null, null),
  ('9fffcdfc-5b67-489b-80ed-a434d53b9792', 'Engagement Letter', 1, 'f76db1f6-6011-4f55-b273-10a2e9c6898d', null),
  ('9fffcdfc-5b67-489b-80ed-a434d53b9792', 'Document Collection', 2, null, '4f507ba1-c951-46bd-925c-257147ccaf3a'),
  ('9fffcdfc-5b67-489b-80ed-a434d53b9792', 'Document Review', 3, null, null),
  ('9fffcdfc-5b67-489b-80ed-a434d53b9792', 'Preparation', 4, null, null),
  ('9fffcdfc-5b67-489b-80ed-a434d53b9792', 'Client Review', 5, null, null),
  ('9fffcdfc-5b67-489b-80ed-a434d53b9792', 'Ready to File', 6, null, null),
  ('9fffcdfc-5b67-489b-80ed-a434d53b9792', 'Filed', 7, null, null),
  ('9fffcdfc-5b67-489b-80ed-a434d53b9792', 'Accepted / Complete', 8, null, null);

-- Automation 1: engagement created -> advance out of the landing stage and
-- send the letter. Firms who want this step manual instead of automatic
-- can pause this automation (existing capability) and use the stage's
-- "Send for signature..." manual action instead.
insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, is_enabled, status)
values (
  '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7',
  'Individual Tax: engagement accepted -> send engagement letter',
  'individual-tax-engagement-accepted-send-letter',
  'Advances the engagement from Engagement Accepted into Engagement Letter and sends it for signature.',
  'engagement.created',
  jsonb_build_object('service_id', '2ff9adce-8a62-4c39-acf5-f3e8e9f8ec68'),
  true,
  'published'
);

insert into public.automation_steps (automation_id, display_order, action_type, action_config)
select id, 0, 'change_stage', '{}'::jsonb
from public.automations where slug = 'individual-tax-engagement-accepted-send-letter' and workspace_id = '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7';

insert into public.automation_steps (automation_id, display_order, action_type, action_config)
select id, 1, 'send_engagement_letter', jsonb_build_object('engagement_letter_template_id', 'f76db1f6-6011-4f55-b273-10a2e9c6898d')
from public.automations where slug = 'individual-tax-engagement-accepted-send-letter' and workspace_id = '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7';

-- Automation 2: letter signed -> advance into Document Collection and
-- request documents.
insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, is_enabled, status)
values (
  '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7',
  'Individual Tax: letter signed -> request documents',
  'individual-tax-letter-signed-request-documents',
  'Once the client signs the engagement letter, moves the engagement into Document Collection and sends the document request.',
  'engagement_letter.signed',
  jsonb_build_object('service_id', '2ff9adce-8a62-4c39-acf5-f3e8e9f8ec68'),
  true,
  'published'
);

insert into public.automation_steps (automation_id, display_order, action_type, action_config)
select id, 0, 'change_stage', '{}'::jsonb
from public.automations where slug = 'individual-tax-letter-signed-request-documents' and workspace_id = '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7';

insert into public.automation_steps (automation_id, display_order, action_type, action_config)
select id, 1, 'send_document_request', jsonb_build_object(
  'document_request_template_id', '4f507ba1-c951-46bd-925c-257147ccaf3a',
  'title', 'Individual Tax Documents',
  'due_in_days', '14'
)
from public.automations where slug = 'individual-tax-letter-signed-request-documents' and workspace_id = '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7';

-- Automation 3: all requested documents received -> advance into Document
-- Review (a human QC checkpoint) and task staff to check what came in.
-- No auto-advance past Document Review -- moving into Preparation is a
-- human call, same as before.
insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, is_enabled, status)
values (
  '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7',
  'Individual Tax: documents received -> move to document review',
  'individual-tax-documents-received-document-review',
  'Once all required documents are in, moves the engagement into Document Review and creates a task for staff to check what came in before approving it into Preparation.',
  'document_request.completed',
  jsonb_build_object('service_id', '2ff9adce-8a62-4c39-acf5-f3e8e9f8ec68'),
  true,
  'published'
);

insert into public.automation_steps (automation_id, display_order, action_type, action_config)
select id, 0, 'change_stage', '{}'::jsonb
from public.automations where slug = 'individual-tax-documents-received-document-review' and workspace_id = '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7';

insert into public.automation_steps (automation_id, display_order, action_type, action_config)
select id, 1, 'create_task', jsonb_build_object(
  'title', 'Review submitted documents',
  'description', 'Client has submitted their required documents. Review what came in -- if anything is missing, follow up with the client directly; once complete, approve this stage to move the engagement into Preparation.',
  'due_in_days', '2',
  'priority', 'medium'
)
from public.automations where slug = 'individual-tax-documents-received-document-review' and workspace_id = '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7';
