-- Wires the three automations that make the Individual Tax pipeline
-- actually run itself, using the action/trigger types built earlier this
-- session plus the templates just created:
--   1. engagement.created -> send the engagement letter
--   2. engagement_letter.signed -> advance the stage + request documents
--   3. document_request.completed -> tell staff to review what came in
--      (no auto-advance; moving into Preparation is a human call)
insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, is_enabled, status)
values (
  '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7',
  'Individual Tax: send engagement letter',
  'individual-tax-send-engagement-letter',
  'Sends the engagement letter for signature as soon as the engagement is created.',
  'engagement.created',
  jsonb_build_object('service_id', '2ff9adce-8a62-4c39-acf5-f3e8e9f8ec68'),
  true,
  'published'
);

insert into public.automation_steps (automation_id, display_order, action_type, action_config)
select id, 0, 'send_engagement_letter', jsonb_build_object(
  'engagement_letter_template_id',
  (select id from public.engagement_letter_templates where slug = 'individual-tax-engagement-letter' and workspace_id = '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7')
)
from public.automations where slug = 'individual-tax-send-engagement-letter' and workspace_id = '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7';

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
  'document_request_template_id',
  (select id from public.document_request_templates where slug = 'individual-tax-documents' and workspace_id = '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7'),
  'title', 'Individual Tax Documents',
  'due_in_days', '14'
)
from public.automations where slug = 'individual-tax-letter-signed-request-documents' and workspace_id = '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7';

insert into public.automations (workspace_id, name, slug, description, trigger_type, trigger_config, is_enabled, status)
values (
  '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7',
  'Individual Tax: documents received -> notify staff',
  'individual-tax-documents-received-notify-staff',
  'Once all required documents are in, creates a task for staff to review them before moving the engagement into Preparation.',
  'document_request.completed',
  jsonb_build_object('service_id', '2ff9adce-8a62-4c39-acf5-f3e8e9f8ec68'),
  true,
  'published'
);

insert into public.automation_steps (automation_id, display_order, action_type, action_config)
select id, 0, 'create_task', jsonb_build_object(
  'title', 'Review submitted documents',
  'description', 'Client has submitted their required documents. Review what came in, then approve this stage to move the engagement into Preparation.',
  'due_in_days', '2',
  'priority', 'medium'
)
from public.automations where slug = 'individual-tax-documents-received-notify-staff' and workspace_id = '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7';
