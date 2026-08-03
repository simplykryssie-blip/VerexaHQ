-- Phase 2: Firm Configuration Engine -- Verexa System Blueprint Library (cont.)
-- Amended Return, Extension Filing, IRS Notice Response, Tax Planning.

-- ============================================================================
-- BLUEPRINT 3: Amended Return
-- ============================================================================
insert into public.processes (name, slug, description, status) values
  ('Amended Return', 'amended-return-process', 'Workflow for preparing and filing an amended return (1040-X or equivalent).', 'published');

insert into public.process_stages (process_id, name, display_order, completion_rule, due_date_rule) values
  ((select id from public.processes where slug = 'amended-return-process'), 'Intake & Review Original Return', 1, 'all_tasks_complete', '{"basis":"case_created","offset_days":5}'),
  ((select id from public.processes where slug = 'amended-return-process'), 'Prepare Amendment', 2, 'all_tasks_complete', '{"basis":"stage_entry","offset_days":7}'),
  ((select id from public.processes where slug = 'amended-return-process'), 'Signature & Filed', 3, 'all_tasks_complete', '{"basis":"stage_entry","offset_days":3}');

update public.process_stages set reviewer_role_id = (select id from public.roles where slug = 'ero' and workspace_id is null)
where process_id = (select id from public.processes where slug = 'amended-return-process') and name = 'Prepare Amendment';

insert into public.process_tasks (process_stage_id, name, display_order, is_required, assignee_role_id) values
  ((select id from public.process_stages where name = 'Intake & Review Original Return' and process_id = (select id from public.processes where slug = 'amended-return-process')), 'Pull and review originally filed return', 1, true, (select id from public.roles where slug = 'ptin_preparer' and workspace_id is null)),
  ((select id from public.process_stages where name = 'Prepare Amendment' and process_id = (select id from public.processes where slug = 'amended-return-process')), 'Prepare Form 1040-X / amended schedules', 1, true, (select id from public.roles where slug = 'ptin_preparer' and workspace_id is null)),
  ((select id from public.process_stages where name = 'Prepare Amendment' and process_id = (select id from public.processes where slug = 'amended-return-process')), 'Reviewer sign-off', 2, true, (select id from public.roles where slug = 'ero' and workspace_id is null)),
  ((select id from public.process_stages where name = 'Signature & Filed' and process_id = (select id from public.processes where slug = 'amended-return-process')), 'Collect client signature', 1, true, (select id from public.roles where slug = 'staff' and workspace_id is null)),
  ((select id from public.process_stages where name = 'Signature & Filed' and process_id = (select id from public.processes where slug = 'amended-return-process')), 'File amendment', 2, true, (select id from public.roles where slug = 'ero' and workspace_id is null));

insert into public.pipelines (name, slug, description, status) values
  ('Amended Returns', 'amended-return-pipeline', 'Kanban board for tracking amended return requests.', 'published');

insert into public.pipeline_stages (pipeline_id, name, display_order, color, is_terminal) values
  ((select id from public.pipelines where slug = 'amended-return-pipeline'), 'Requested', 1, '#94a3b8', false),
  ((select id from public.pipelines where slug = 'amended-return-pipeline'), 'In Progress', 2, '#3b82f6', false),
  ((select id from public.pipelines where slug = 'amended-return-pipeline'), 'Filed', 3, '#16a34a', true);

insert into public.document_request_templates (name, slug, description, status) values
  ('Amended Return Document Request', 'amended-return-docreq', 'Documents needed to prepare an amended return.', 'published');

insert into public.document_request_items (document_request_template_id, category, name, is_required, display_order) values
  ((select id from public.document_request_templates where slug = 'amended-return-docreq'), 'Prior Filing', 'Copy of the originally filed return', true, 1),
  ((select id from public.document_request_templates where slug = 'amended-return-docreq'), 'Correspondence', 'IRS or state notice, if applicable', false, 2),
  ((select id from public.document_request_templates where slug = 'amended-return-docreq'), 'Support', 'Documentation supporting the correction', true, 3);

insert into public.engagement_letter_templates (name, slug, body_html, merge_fields, requires_signature, status) values
  ('Amended Return Engagement Letter', 'amended-return-engagement-letter',
   '<p>Dear {{client_name}},</p><p>This letter confirms our engagement to prepare an amended return for tax year {{tax_year}}. {{firm_name}} will prepare the amendment based on the originally filed return and the corrected information you provide. Our fee for this engagement is {{fee_amount}}, due {{payment_terms}}.</p>',
   '["client_name", "tax_year", "firm_name", "fee_amount", "payment_terms"]'::jsonb,
   true, 'published');

insert into public.email_templates (name, slug, category, subject, body_html, merge_fields, status) values
  ('Amended Return Ready For Signature', 'amended-return-ready-email', 'case_update', 'Your amended {{tax_year}} return is ready to sign',
   '<p>Hi {{client_first_name}},</p><p>Your amended {{tax_year}} return has been prepared and reviewed. Please log in to your client portal to review and sign.</p><p>Thanks,<br/>{{firm_name}}</p>',
   '["client_first_name", "tax_year", "firm_name"]'::jsonb, 'published');

insert into public.sms_templates (name, slug, body, merge_fields, status) values
  ('Amended Return Ready SMS', 'amended-return-ready-sms', 'Hi {{client_first_name}}, your amended {{tax_year}} return is ready to review and sign in your {{firm_name}} client portal.',
   '["client_first_name", "tax_year", "firm_name"]'::jsonb, 'published');

insert into public.pricing_rules (name, slug, pricing_method, base_amount, minimum_amount, maximum_amount, allow_override, status) values
  ('Amended Return - Flat Fee', 'amended-return-pricing', 'flat_fee', 150.00, 100.00, 400.00, true, 'published');

insert into public.billing_rules (name, slug, invoice_timing, payment_before_release, automatic_reminders, status) values
  ('Amended Return - Pay Before Release', 'amended-return-billing', 'after_work', true, '[{"days_after_due": 5}]'::jsonb, 'published');

insert into public.services (
  name, slug, description, service_category_id, estimated_duration_minutes, default_price,
  pricing_rule_id, billing_rule_id, process_id, pipeline_id,
  document_request_template_id, engagement_letter_template_id,
  is_bookable, is_portal_visible, requires_organizer, requires_engagement_letter,
  requires_documents, requires_signature, requires_review, requires_invoice, requires_payment_before_release,
  display_order, tags, status
) values (
  'Amended Return', 'amended-return', 'Preparation and filing of an amended individual or business return (Form 1040-X or equivalent).',
  (select id from public.service_categories where slug = 'amendments-corrections'), 60, 150.00,
  (select id from public.pricing_rules where slug = 'amended-return-pricing'),
  (select id from public.billing_rules where slug = 'amended-return-billing'),
  (select id from public.processes where slug = 'amended-return-process'),
  (select id from public.pipelines where slug = 'amended-return-pipeline'),
  (select id from public.document_request_templates where slug = 'amended-return-docreq'),
  (select id from public.engagement_letter_templates where slug = 'amended-return-engagement-letter'),
  false, true, false, true, true, true, true, true, true,
  1, array['amended', '1040-x'], 'published'
);

insert into public.blueprints (name, slug, description, category, status) values
  ('Amended Return', 'amended-return-blueprint', 'Complete configuration for correcting a previously filed return.', 'amended', 'published');

insert into public.blueprint_components (blueprint_id, component_type, component_id, is_primary)
select (select id from public.blueprints where slug = 'amended-return-blueprint'), t.component_type, t.component_id, t.is_primary
from (values
  ('service_categories', (select id from public.service_categories where slug = 'amendments-corrections'), false),
  ('services', (select id from public.services where slug = 'amended-return'), true),
  ('processes', (select id from public.processes where slug = 'amended-return-process'), false),
  ('pipelines', (select id from public.pipelines where slug = 'amended-return-pipeline'), false),
  ('document_request_templates', (select id from public.document_request_templates where slug = 'amended-return-docreq'), false),
  ('engagement_letter_templates', (select id from public.engagement_letter_templates where slug = 'amended-return-engagement-letter'), false),
  ('email_templates', (select id from public.email_templates where slug = 'amended-return-ready-email'), false),
  ('sms_templates', (select id from public.sms_templates where slug = 'amended-return-ready-sms'), false),
  ('pricing_rules', (select id from public.pricing_rules where slug = 'amended-return-pricing'), false),
  ('billing_rules', (select id from public.billing_rules where slug = 'amended-return-billing'), false)
) as t(component_type, component_id, is_primary);

-- ============================================================================
-- BLUEPRINT 4: Extension Filing
-- ============================================================================
insert into public.processes (name, slug, description, status) values
  ('Extension Filing', 'extension-filing-process', 'Workflow for estimating liability and filing a federal/state extension.', 'published');

insert into public.process_stages (process_id, name, display_order, completion_rule, due_date_rule) values
  ((select id from public.processes where slug = 'extension-filing-process'), 'Estimate & Prepare Extension', 1, 'all_tasks_complete', '{"basis":"case_created","offset_days":2}'),
  ((select id from public.processes where slug = 'extension-filing-process'), 'Filed', 2, 'all_tasks_complete', '{}');

insert into public.process_tasks (process_stage_id, name, display_order, is_required, assignee_role_id) values
  ((select id from public.process_stages where name = 'Estimate & Prepare Extension' and process_id = (select id from public.processes where slug = 'extension-filing-process')), 'Estimate tax liability', 1, true, (select id from public.roles where slug = 'ptin_preparer' and workspace_id is null)),
  ((select id from public.process_stages where name = 'Estimate & Prepare Extension' and process_id = (select id from public.processes where slug = 'extension-filing-process')), 'Prepare extension form (4868/7004)', 2, true, (select id from public.roles where slug = 'ptin_preparer' and workspace_id is null)),
  ((select id from public.process_stages where name = 'Filed' and process_id = (select id from public.processes where slug = 'extension-filing-process')), 'Collect authorization and file extension', 1, true, (select id from public.roles where slug = 'ero' and workspace_id is null));

insert into public.pipelines (name, slug, description, status) values
  ('Extensions', 'extension-filing-pipeline', 'Kanban board for tracking extension requests.', 'published');

insert into public.pipeline_stages (pipeline_id, name, display_order, color, is_terminal) values
  ((select id from public.pipelines where slug = 'extension-filing-pipeline'), 'Requested', 1, '#94a3b8', false),
  ((select id from public.pipelines where slug = 'extension-filing-pipeline'), 'Filed', 2, '#16a34a', true);

insert into public.document_request_templates (name, slug, description, status) values
  ('Extension Filing Document Request', 'extension-filing-docreq', 'Minimal documentation needed to estimate and file an extension.', 'published');

insert into public.document_request_items (document_request_template_id, category, name, is_required, display_order) values
  ((select id from public.document_request_templates where slug = 'extension-filing-docreq'), 'Estimate', 'Estimated current-year income documentation', true, 1),
  ((select id from public.document_request_templates where slug = 'extension-filing-docreq'), 'Prior Filing', 'Prior year return (new clients only)', false, 2);

insert into public.engagement_letter_templates (name, slug, body_html, merge_fields, requires_signature, status) values
  ('Extension Filing Engagement Letter', 'extension-filing-engagement-letter',
   '<p>Dear {{client_name}},</p><p>This letter confirms our engagement to estimate your {{tax_year}} tax liability and file a filing extension on your behalf. An extension extends the time to file, not the time to pay. Our fee for this engagement is {{fee_amount}}.</p>',
   '["client_name", "tax_year", "firm_name", "fee_amount"]'::jsonb,
   true, 'published');

insert into public.email_templates (name, slug, category, subject, body_html, merge_fields, status) values
  ('Extension Filed Confirmation', 'extension-filing-filed-email', 'case_update', 'Your {{tax_year}} extension has been filed',
   '<p>Hi {{client_first_name}},</p><p>Your {{tax_year}} filing extension has been submitted. Remember: an extension extends the time to file, not the time to pay any tax due.</p><p>Thanks,<br/>{{firm_name}}</p>',
   '["client_first_name", "tax_year", "firm_name"]'::jsonb, 'published');

insert into public.sms_templates (name, slug, body, merge_fields, status) values
  ('Extension Filed SMS', 'extension-filing-filed-sms', 'Hi {{client_first_name}}, your {{tax_year}} filing extension has been submitted by {{firm_name}}.',
   '["client_first_name", "tax_year", "firm_name"]'::jsonb, 'published');

insert into public.pricing_rules (name, slug, pricing_method, base_amount, minimum_amount, maximum_amount, allow_override, status) values
  ('Extension Filing - Flat Fee', 'extension-filing-pricing', 'flat_fee', 75.00, 50.00, 150.00, true, 'published');

insert into public.billing_rules (name, slug, invoice_timing, payment_before_release, status) values
  ('Extension Filing - Bill After Filing', 'extension-filing-billing', 'after_work', false, 'published');

insert into public.services (
  name, slug, description, service_category_id, estimated_duration_minutes, default_price,
  pricing_rule_id, billing_rule_id, process_id, pipeline_id,
  document_request_template_id, engagement_letter_template_id,
  is_bookable, is_portal_visible, requires_organizer, requires_engagement_letter,
  requires_documents, requires_signature, requires_review, requires_invoice, requires_payment_before_release,
  display_order, tags, status
) values (
  'Extension Filing', 'extension-filing', 'Estimate current-year tax liability and file a federal/state filing extension.',
  (select id from public.service_categories where slug = 'extensions'), 20, 75.00,
  (select id from public.pricing_rules where slug = 'extension-filing-pricing'),
  (select id from public.billing_rules where slug = 'extension-filing-billing'),
  (select id from public.processes where slug = 'extension-filing-process'),
  (select id from public.pipelines where slug = 'extension-filing-pipeline'),
  (select id from public.document_request_templates where slug = 'extension-filing-docreq'),
  (select id from public.engagement_letter_templates where slug = 'extension-filing-engagement-letter'),
  false, true, false, true, false, true, false, true, false,
  1, array['extension', '4868', '7004'], 'published'
);

insert into public.blueprints (name, slug, description, category, status) values
  ('Extension Filing', 'extension-filing-blueprint', 'Complete configuration for estimating liability and filing a filing extension.', 'extension', 'published');

insert into public.blueprint_components (blueprint_id, component_type, component_id, is_primary)
select (select id from public.blueprints where slug = 'extension-filing-blueprint'), t.component_type, t.component_id, t.is_primary
from (values
  ('service_categories', (select id from public.service_categories where slug = 'extensions'), false),
  ('services', (select id from public.services where slug = 'extension-filing'), true),
  ('processes', (select id from public.processes where slug = 'extension-filing-process'), false),
  ('pipelines', (select id from public.pipelines where slug = 'extension-filing-pipeline'), false),
  ('document_request_templates', (select id from public.document_request_templates where slug = 'extension-filing-docreq'), false),
  ('engagement_letter_templates', (select id from public.engagement_letter_templates where slug = 'extension-filing-engagement-letter'), false),
  ('email_templates', (select id from public.email_templates where slug = 'extension-filing-filed-email'), false),
  ('sms_templates', (select id from public.sms_templates where slug = 'extension-filing-filed-sms'), false),
  ('pricing_rules', (select id from public.pricing_rules where slug = 'extension-filing-pricing'), false),
  ('billing_rules', (select id from public.billing_rules where slug = 'extension-filing-billing'), false)
) as t(component_type, component_id, is_primary);

-- ============================================================================
-- BLUEPRINT 5: IRS Notice Response
-- ============================================================================
insert into public.processes (name, slug, description, status) values
  ('IRS Notice Response', 'irs-notice-response-process', 'Workflow for analyzing and responding to an IRS or state notice.', 'published');

insert into public.process_stages (process_id, name, display_order, completion_rule, due_date_rule) values
  ((select id from public.processes where slug = 'irs-notice-response-process'), 'Notice Intake & Analysis', 1, 'all_tasks_complete', '{"basis":"case_created","offset_days":3}'),
  ((select id from public.processes where slug = 'irs-notice-response-process'), 'Response Preparation', 2, 'all_tasks_complete', '{"basis":"stage_entry","offset_days":10}'),
  ((select id from public.processes where slug = 'irs-notice-response-process'), 'Client Review & Authorization', 3, 'all_tasks_complete', '{"basis":"stage_entry","offset_days":3}'),
  ((select id from public.processes where slug = 'irs-notice-response-process'), 'Submitted to IRS', 4, 'manual_only', '{}');

update public.process_stages set reviewer_role_id = (select id from public.roles where slug = 'ero' and workspace_id is null)
where process_id = (select id from public.processes where slug = 'irs-notice-response-process') and name = 'Response Preparation';

insert into public.process_tasks (process_stage_id, name, display_order, is_required, assignee_role_id) values
  ((select id from public.process_stages where name = 'Notice Intake & Analysis' and process_id = (select id from public.processes where slug = 'irs-notice-response-process')), 'Log notice deadline and analyze issue', 1, true, (select id from public.roles where slug = 'ero' and workspace_id is null)),
  ((select id from public.process_stages where name = 'Response Preparation' and process_id = (select id from public.processes where slug = 'irs-notice-response-process')), 'Draft response and supporting documentation', 1, true, (select id from public.roles where slug = 'ptin_preparer' and workspace_id is null)),
  ((select id from public.process_stages where name = 'Response Preparation' and process_id = (select id from public.processes where slug = 'irs-notice-response-process')), 'Reviewer sign-off', 2, true, (select id from public.roles where slug = 'ero' and workspace_id is null)),
  ((select id from public.process_stages where name = 'Client Review & Authorization' and process_id = (select id from public.processes where slug = 'irs-notice-response-process')), 'Client reviews and authorizes response', 1, true, (select id from public.roles where slug = 'staff' and workspace_id is null)),
  ((select id from public.process_stages where name = 'Submitted to IRS' and process_id = (select id from public.processes where slug = 'irs-notice-response-process')), 'Submit response to IRS/state', 1, true, (select id from public.roles where slug = 'ero' and workspace_id is null));

insert into public.pipelines (name, slug, description, status) values
  ('IRS Notice Cases', 'irs-notice-response-pipeline', 'Kanban board for tracking notice response cases.', 'published');

insert into public.pipeline_stages (pipeline_id, name, display_order, color, is_terminal) values
  ((select id from public.pipelines where slug = 'irs-notice-response-pipeline'), 'New Notices', 1, '#ef4444', false),
  ((select id from public.pipelines where slug = 'irs-notice-response-pipeline'), 'In Analysis', 2, '#f59e0b', false),
  ((select id from public.pipelines where slug = 'irs-notice-response-pipeline'), 'Awaiting Client', 3, '#a855f7', false),
  ((select id from public.pipelines where slug = 'irs-notice-response-pipeline'), 'Submitted', 4, '#3b82f6', false),
  ((select id from public.pipelines where slug = 'irs-notice-response-pipeline'), 'Resolved', 5, '#16a34a', true);

insert into public.document_request_templates (name, slug, description, status) values
  ('IRS Notice Response Document Request', 'irs-notice-response-docreq', 'Documents needed to analyze and respond to a notice.', 'published');

insert into public.document_request_items (document_request_template_id, category, name, is_required, display_order) values
  ((select id from public.document_request_templates where slug = 'irs-notice-response-docreq'), 'Notice', 'Copy of the IRS/state notice (all pages)', true, 1),
  ((select id from public.document_request_templates where slug = 'irs-notice-response-docreq'), 'Support', 'Supporting documentation for the tax year in question', true, 2),
  ((select id from public.document_request_templates where slug = 'irs-notice-response-docreq'), 'History', 'Prior correspondence with the IRS/state on this issue', false, 3);

insert into public.engagement_letter_templates (name, slug, body_html, merge_fields, requires_signature, status) values
  ('IRS Notice Response Engagement Letter', 'irs-notice-response-engagement-letter',
   '<p>Dear {{client_name}},</p><p>This letter confirms our engagement to analyze and respond to the {{notice_type}} notice dated {{notice_date}} on your behalf, which may include preparing a Power of Attorney (Form 2848) to represent you. Our fee for this engagement is {{fee_amount}}, with a {{deposit_percent}}% deposit due upon signing.</p>',
   '["client_name", "notice_type", "notice_date", "firm_name", "fee_amount", "deposit_percent"]'::jsonb,
   true, 'published');

insert into public.email_templates (name, slug, category, subject, body_html, merge_fields, status) values
  ('Notice Response Ready For Review', 'irs-notice-response-ready-email', 'case_update', 'Your response to the {{notice_type}} notice is ready to review',
   '<p>Hi {{client_first_name}},</p><p>We have prepared a response to your {{notice_type}} notice. Please log in to your client portal to review and authorize submission.</p><p>Thanks,<br/>{{firm_name}}</p>',
   '["client_first_name", "notice_type", "firm_name"]'::jsonb, 'published');

insert into public.sms_templates (name, slug, body, merge_fields, status) values
  ('Notice Response Ready SMS', 'irs-notice-response-ready-sms', 'Hi {{client_first_name}}, your response to the {{notice_type}} notice is ready to review in your {{firm_name}} client portal.',
   '["client_first_name", "notice_type", "firm_name"]'::jsonb, 'published');

insert into public.pricing_rules (name, slug, pricing_method, minimum_amount, allow_override, status) values
  ('IRS Notice Response - Custom Quote', 'irs-notice-response-pricing', 'custom_quote', 200.00, true, 'published');

insert into public.billing_rules (name, slug, invoice_timing, deposit_required, deposit_percent, payment_before_release, automatic_reminders, status) values
  ('IRS Notice Response - Deposit Required', 'irs-notice-response-billing', 'before_work', true, 50.00, true, '[{"days_after_due": 3}, {"days_after_due": 10}]'::jsonb, 'published');

insert into public.services (
  name, slug, description, service_category_id, estimated_duration_minutes, default_price,
  pricing_rule_id, billing_rule_id, process_id, pipeline_id,
  document_request_template_id, engagement_letter_template_id,
  is_bookable, is_portal_visible, requires_organizer, requires_engagement_letter,
  requires_documents, requires_signature, requires_review, requires_invoice, requires_payment_before_release,
  display_order, tags, status
) values (
  'IRS Notice Response', 'irs-notice-response', 'Analysis of and response to an IRS or state tax notice, including possible representation.',
  (select id from public.service_categories where slug = 'irs-resolution'), 120, null,
  (select id from public.pricing_rules where slug = 'irs-notice-response-pricing'),
  (select id from public.billing_rules where slug = 'irs-notice-response-billing'),
  (select id from public.processes where slug = 'irs-notice-response-process'),
  (select id from public.pipelines where slug = 'irs-notice-response-pipeline'),
  (select id from public.document_request_templates where slug = 'irs-notice-response-docreq'),
  (select id from public.engagement_letter_templates where slug = 'irs-notice-response-engagement-letter'),
  false, true, false, true, true, true, true, true, true,
  1, array['irs-notice', 'resolution'], 'published'
);

insert into public.blueprints (name, slug, description, category, status) values
  ('IRS Notice Response', 'irs-notice-response-blueprint', 'Complete configuration for analyzing and responding to IRS/state notices.', 'irs_notice', 'published');

insert into public.blueprint_components (blueprint_id, component_type, component_id, is_primary)
select (select id from public.blueprints where slug = 'irs-notice-response-blueprint'), t.component_type, t.component_id, t.is_primary
from (values
  ('service_categories', (select id from public.service_categories where slug = 'irs-resolution'), false),
  ('services', (select id from public.services where slug = 'irs-notice-response'), true),
  ('processes', (select id from public.processes where slug = 'irs-notice-response-process'), false),
  ('pipelines', (select id from public.pipelines where slug = 'irs-notice-response-pipeline'), false),
  ('document_request_templates', (select id from public.document_request_templates where slug = 'irs-notice-response-docreq'), false),
  ('engagement_letter_templates', (select id from public.engagement_letter_templates where slug = 'irs-notice-response-engagement-letter'), false),
  ('email_templates', (select id from public.email_templates where slug = 'irs-notice-response-ready-email'), false),
  ('sms_templates', (select id from public.sms_templates where slug = 'irs-notice-response-ready-sms'), false),
  ('pricing_rules', (select id from public.pricing_rules where slug = 'irs-notice-response-pricing'), false),
  ('billing_rules', (select id from public.billing_rules where slug = 'irs-notice-response-billing'), false)
) as t(component_type, component_id, is_primary);

-- ============================================================================
-- BLUEPRINT 6: Tax Planning
-- ============================================================================
insert into public.processes (name, slug, description, status) values
  ('Tax Planning', 'tax-planning-process', 'Workflow for a proactive tax planning engagement.', 'published');

insert into public.process_stages (process_id, name, display_order, completion_rule, due_date_rule) values
  ((select id from public.processes where slug = 'tax-planning-process'), 'Discovery Call', 1, 'manual_only', '{"basis":"case_created","offset_days":5}'),
  ((select id from public.processes where slug = 'tax-planning-process'), 'Plan Development', 2, 'all_tasks_complete', '{"basis":"stage_entry","offset_days":10}'),
  ((select id from public.processes where slug = 'tax-planning-process'), 'Plan Delivery & Review Meeting', 3, 'manual_only', '{"basis":"stage_entry","offset_days":5}');

insert into public.process_tasks (process_stage_id, name, display_order, is_required, assignee_role_id) values
  ((select id from public.process_stages where name = 'Discovery Call' and process_id = (select id from public.processes where slug = 'tax-planning-process')), 'Hold discovery call and gather goals', 1, true, (select id from public.roles where slug = 'ero' and workspace_id is null)),
  ((select id from public.process_stages where name = 'Plan Development' and process_id = (select id from public.processes where slug = 'tax-planning-process')), 'Model tax scenarios and strategies', 1, true, (select id from public.roles where slug = 'ero' and workspace_id is null)),
  ((select id from public.process_stages where name = 'Plan Development' and process_id = (select id from public.processes where slug = 'tax-planning-process')), 'Draft the written plan', 2, true, (select id from public.roles where slug = 'ptin_preparer' and workspace_id is null)),
  ((select id from public.process_stages where name = 'Plan Delivery & Review Meeting' and process_id = (select id from public.processes where slug = 'tax-planning-process')), 'Deliver plan and hold review meeting', 1, true, (select id from public.roles where slug = 'ero' and workspace_id is null));

insert into public.pipelines (name, slug, description, status) values
  ('Tax Planning Engagements', 'tax-planning-pipeline', 'Kanban board for tracking planning engagements.', 'published');

insert into public.pipeline_stages (pipeline_id, name, display_order, color, is_terminal) values
  ((select id from public.pipelines where slug = 'tax-planning-pipeline'), 'Scheduled', 1, '#94a3b8', false),
  ((select id from public.pipelines where slug = 'tax-planning-pipeline'), 'In Progress', 2, '#3b82f6', false),
  ((select id from public.pipelines where slug = 'tax-planning-pipeline'), 'Delivered', 3, '#16a34a', true);

insert into public.document_request_templates (name, slug, description, status) values
  ('Tax Planning Document Request', 'tax-planning-docreq', 'Documents needed to build a tax plan.', 'published');

insert into public.document_request_items (document_request_template_id, category, name, is_required, display_order) values
  ((select id from public.document_request_templates where slug = 'tax-planning-docreq'), 'History', 'Most recently filed tax return', true, 1),
  ((select id from public.document_request_templates where slug = 'tax-planning-docreq'), 'Projections', 'Current year income and life-event projections', true, 2);

insert into public.engagement_letter_templates (name, slug, body_html, merge_fields, requires_signature, status) values
  ('Tax Planning Engagement Letter', 'tax-planning-engagement-letter',
   '<p>Dear {{client_name}},</p><p>This letter confirms our engagement to provide proactive tax planning advisory services for {{tax_year}}. This is an advisory engagement and does not include return preparation or e-filing. Our fee is {{fee_amount}} at our standard hourly rate, with a deposit due upon signing.</p>',
   '["client_name", "tax_year", "firm_name", "fee_amount"]'::jsonb,
   true, 'published');

insert into public.email_templates (name, slug, category, subject, body_html, merge_fields, status) values
  ('Tax Plan Ready For Review', 'tax-planning-ready-email', 'case_update', 'Your {{tax_year}} tax plan is ready',
   '<p>Hi {{client_first_name}},</p><p>Your personalized {{tax_year}} tax plan is ready. Please log in to your client portal to review it before our meeting.</p><p>Thanks,<br/>{{firm_name}}</p>',
   '["client_first_name", "tax_year", "firm_name"]'::jsonb, 'published');

insert into public.sms_templates (name, slug, body, merge_fields, status) values
  ('Tax Plan Ready SMS', 'tax-planning-ready-sms', 'Hi {{client_first_name}}, your {{tax_year}} tax plan is ready to review in your {{firm_name}} client portal.',
   '["client_first_name", "tax_year", "firm_name"]'::jsonb, 'published');

insert into public.pricing_rules (name, slug, pricing_method, hourly_rate, minimum_amount, allow_override, status) values
  ('Tax Planning - Hourly', 'tax-planning-pricing', 'hourly', 200.00, 400.00, true, 'published');

insert into public.billing_rules (name, slug, invoice_timing, deposit_required, deposit_percent, status) values
  ('Tax Planning - Deposit Required', 'tax-planning-billing', 'before_work', true, 50.00, 'published');

insert into public.services (
  name, slug, description, service_category_id, estimated_duration_minutes, default_price,
  pricing_rule_id, billing_rule_id, process_id, pipeline_id,
  document_request_template_id, engagement_letter_template_id,
  is_bookable, is_portal_visible, requires_organizer, requires_engagement_letter,
  requires_documents, requires_signature, requires_review, requires_invoice, requires_payment_before_release,
  display_order, tags, status
) values (
  'Tax Planning', 'tax-planning', 'Proactive tax planning advisory engagement: discovery, strategy modeling, written plan, and review meeting.',
  (select id from public.service_categories where slug = 'tax-planning'), 120, 400.00,
  (select id from public.pricing_rules where slug = 'tax-planning-pricing'),
  (select id from public.billing_rules where slug = 'tax-planning-billing'),
  (select id from public.processes where slug = 'tax-planning-process'),
  (select id from public.pipelines where slug = 'tax-planning-pipeline'),
  (select id from public.document_request_templates where slug = 'tax-planning-docreq'),
  (select id from public.engagement_letter_templates where slug = 'tax-planning-engagement-letter'),
  true, true, false, true, true, true, false, true, false,
  1, array['planning', 'advisory'], 'published'
);

insert into public.blueprints (name, slug, description, category, status) values
  ('Tax Planning', 'tax-planning-blueprint', 'Complete configuration for a proactive tax planning advisory engagement.', 'planning', 'published');

insert into public.blueprint_components (blueprint_id, component_type, component_id, is_primary)
select (select id from public.blueprints where slug = 'tax-planning-blueprint'), t.component_type, t.component_id, t.is_primary
from (values
  ('service_categories', (select id from public.service_categories where slug = 'tax-planning'), false),
  ('services', (select id from public.services where slug = 'tax-planning'), true),
  ('processes', (select id from public.processes where slug = 'tax-planning-process'), false),
  ('pipelines', (select id from public.pipelines where slug = 'tax-planning-pipeline'), false),
  ('document_request_templates', (select id from public.document_request_templates where slug = 'tax-planning-docreq'), false),
  ('engagement_letter_templates', (select id from public.engagement_letter_templates where slug = 'tax-planning-engagement-letter'), false),
  ('email_templates', (select id from public.email_templates where slug = 'tax-planning-ready-email'), false),
  ('sms_templates', (select id from public.sms_templates where slug = 'tax-planning-ready-sms'), false),
  ('pricing_rules', (select id from public.pricing_rules where slug = 'tax-planning-pricing'), false),
  ('billing_rules', (select id from public.billing_rules where slug = 'tax-planning-billing'), false)
) as t(component_type, component_id, is_primary);
