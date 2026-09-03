insert into public.service_categories (name, slug, display_order) values
  ('Individual Tax', 'individual-tax', 1),
  ('Business Tax', 'business-tax', 2),
  ('Amendments & Corrections', 'amendments-corrections', 3),
  ('Extensions', 'extensions', 4),
  ('IRS Resolution', 'irs-resolution', 5),
  ('Tax Planning', 'tax-planning', 6);

insert into public.processes (name, slug, description, status) values
  ('Individual Tax Preparation', 'individual-tax-prep-process', 'Standard workflow for preparing an individual Form 1040 return.', 'published');

insert into public.process_stages (process_id, name, display_order, completion_rule, due_date_rule) values
  ((select id from public.processes where slug = 'individual-tax-prep-process'), 'Intake & Organizer', 1, 'all_tasks_complete', '{"basis":"case_created","offset_days":7}'),
  ((select id from public.processes where slug = 'individual-tax-prep-process'), 'Document Collection', 2, 'all_tasks_complete', '{"basis":"stage_entry","offset_days":10}'),
  ((select id from public.processes where slug = 'individual-tax-prep-process'), 'Preparation', 3, 'all_tasks_complete', '{"basis":"stage_entry","offset_days":5}'),
  ((select id from public.processes where slug = 'individual-tax-prep-process'), 'Review', 4, 'manual_only', '{"basis":"stage_entry","offset_days":2}'),
  ((select id from public.processes where slug = 'individual-tax-prep-process'), 'Signature & E-File', 5, 'all_tasks_complete', '{"basis":"stage_entry","offset_days":3}'),
  ((select id from public.processes where slug = 'individual-tax-prep-process'), 'Filed & Delivered', 6, 'manual_only', '{}');

update public.process_stages set reviewer_role_id = (select id from public.roles where slug = 'ero' and workspace_id is null)
where process_id = (select id from public.processes where slug = 'individual-tax-prep-process') and name = 'Review';

insert into public.process_tasks (process_stage_id, name, display_order, is_required, assignee_role_id) values
  ((select id from public.process_stages where name = 'Intake & Organizer' and process_id = (select id from public.processes where slug = 'individual-tax-prep-process')), 'Send organizer to client', 1, true, (select id from public.roles where slug = 'ptin_preparer' and workspace_id is null)),
  ((select id from public.process_stages where name = 'Intake & Organizer' and process_id = (select id from public.processes where slug = 'individual-tax-prep-process')), 'Confirm engagement letter signed', 2, true, (select id from public.roles where slug = 'ptin_preparer' and workspace_id is null)),
  ((select id from public.process_stages where name = 'Document Collection' and process_id = (select id from public.processes where slug = 'individual-tax-prep-process')), 'Send document request', 1, true, (select id from public.roles where slug = 'staff' and workspace_id is null)),
  ((select id from public.process_stages where name = 'Document Collection' and process_id = (select id from public.processes where slug = 'individual-tax-prep-process')), 'Confirm all required documents received', 2, true, (select id from public.roles where slug = 'staff' and workspace_id is null)),
  ((select id from public.process_stages where name = 'Preparation' and process_id = (select id from public.processes where slug = 'individual-tax-prep-process')), 'Prepare Form 1040 and schedules', 1, true, (select id from public.roles where slug = 'ptin_preparer' and workspace_id is null)),
  ((select id from public.process_stages where name = 'Review' and process_id = (select id from public.processes where slug = 'individual-tax-prep-process')), 'Reviewer sign-off', 1, true, (select id from public.roles where slug = 'ero' and workspace_id is null)),
  ((select id from public.process_stages where name = 'Signature & E-File' and process_id = (select id from public.processes where slug = 'individual-tax-prep-process')), 'Collect taxpayer e-signature (8879)', 1, true, (select id from public.roles where slug = 'staff' and workspace_id is null)),
  ((select id from public.process_stages where name = 'Signature & E-File' and process_id = (select id from public.processes where slug = 'individual-tax-prep-process')), 'Transmit return', 2, true, (select id from public.roles where slug = 'ero' and workspace_id is null)),
  ((select id from public.process_stages where name = 'Filed & Delivered' and process_id = (select id from public.processes where slug = 'individual-tax-prep-process')), 'Deliver completed return to client portal', 1, true, (select id from public.roles where slug = 'staff' and workspace_id is null));

insert into public.pipelines (name, slug, description, status) values
  ('Individual Tax Returns', 'individual-tax-prep-pipeline', 'Kanban board for tracking individual returns from prospect to completion.', 'published');

insert into public.pipeline_stages (pipeline_id, name, display_order, color, is_terminal) values
  ((select id from public.pipelines where slug = 'individual-tax-prep-pipeline'), 'Prospective Taxpayers', 1, '#94a3b8', false),
  ((select id from public.pipelines where slug = 'individual-tax-prep-pipeline'), 'Active Returns', 2, '#3b82f6', false),
  ((select id from public.pipelines where slug = 'individual-tax-prep-pipeline'), 'Waiting For Documents', 3, '#f59e0b', false),
  ((select id from public.pipelines where slug = 'individual-tax-prep-pipeline'), 'Review Queue', 4, '#a855f7', false),
  ((select id from public.pipelines where slug = 'individual-tax-prep-pipeline'), 'Ready To Release', 5, '#22c55e', false),
  ((select id from public.pipelines where slug = 'individual-tax-prep-pipeline'), 'Completed', 6, '#16a34a', true);

insert into public.organizer_templates (name, slug, description, status) values
  ('Individual Tax Organizer', 'individual-tax-organizer', 'Standard intake organizer for individual 1040 clients.', 'published');

insert into public.organizer_fields (organizer_template_id, field_type, label, help_text, display_order, is_required) values
  ((select id from public.organizer_templates where slug = 'individual-tax-organizer'), 'short_text', 'Full Legal Name', null, 1, true),
  ((select id from public.organizer_templates where slug = 'individual-tax-organizer'), 'date', 'Date of Birth', null, 2, true),
  ((select id from public.organizer_templates where slug = 'individual-tax-organizer'), 'ssn', 'Social Security Number', 'Encrypted and never shown in plain text after entry.', 3, true),
  ((select id from public.organizer_templates where slug = 'individual-tax-organizer'), 'address', 'Home Address', null, 4, true),
  ((select id from public.organizer_templates where slug = 'individual-tax-organizer'), 'currency', 'Estimated Total Wages (W-2 Box 1)', null, 6, false),
  ((select id from public.organizer_templates where slug = 'individual-tax-organizer'), 'checkbox', 'I was affected by a federally declared disaster this year', null, 7, false),
  ((select id from public.organizer_templates where slug = 'individual-tax-organizer'), 'file_upload', 'Prior Year Return (new clients only)', null, 8, false),
  ((select id from public.organizer_templates where slug = 'individual-tax-organizer'), 'signature', 'Taxpayer Signature', null, 9, true);

insert into public.organizer_fields (organizer_template_id, field_type, label, display_order, is_required, options) values
  ((select id from public.organizer_templates where slug = 'individual-tax-organizer'), 'dropdown', 'Filing Status', 5, true,
    '["Single", "Married Filing Jointly", "Married Filing Separately", "Head of Household", "Qualifying Surviving Spouse"]'::jsonb);

insert into public.organizer_fields (organizer_template_id, field_type, label, display_order, is_required) values
  ((select id from public.organizer_templates where slug = 'individual-tax-organizer'), 'repeating_section', 'Dependents', 10, false);

insert into public.organizer_fields (organizer_template_id, parent_field_id, field_type, label, display_order, is_required) values
  ((select id from public.organizer_templates where slug = 'individual-tax-organizer'),
   (select id from public.organizer_fields where organizer_template_id = (select id from public.organizer_templates where slug = 'individual-tax-organizer') and label = 'Dependents'),
   'short_text', 'Dependent Full Name', 11, true),
  ((select id from public.organizer_templates where slug = 'individual-tax-organizer'),
   (select id from public.organizer_fields where organizer_template_id = (select id from public.organizer_templates where slug = 'individual-tax-organizer') and label = 'Dependents'),
   'ssn', 'Dependent Social Security Number', 12, true),
  ((select id from public.organizer_templates where slug = 'individual-tax-organizer'),
   (select id from public.organizer_fields where organizer_template_id = (select id from public.organizer_templates where slug = 'individual-tax-organizer') and label = 'Dependents'),
   'date', 'Dependent Date of Birth', 13, true);

insert into public.document_request_templates (name, slug, description, status) values
  ('Individual Tax Document Request', 'individual-tax-docreq', 'Standard document checklist requested from individual clients.', 'published');

insert into public.document_request_items (document_request_template_id, category, name, is_required, display_order) values
  ((select id from public.document_request_templates where slug = 'individual-tax-docreq'), 'Identification', 'Government-issued photo ID', true, 1),
  ((select id from public.document_request_templates where slug = 'individual-tax-docreq'), 'Identification', 'Social Security cards for all dependents', true, 2),
  ((select id from public.document_request_templates where slug = 'individual-tax-docreq'), 'Income', 'All W-2s', true, 3),
  ((select id from public.document_request_templates where slug = 'individual-tax-docreq'), 'Income', 'All 1099s (NEC, MISC, INT, DIV, R, G, etc.)', true, 4),
  ((select id from public.document_request_templates where slug = 'individual-tax-docreq'), 'Income', 'K-1s for any partnership/S-corp interests', false, 5),
  ((select id from public.document_request_templates where slug = 'individual-tax-docreq'), 'Deductions', 'Mortgage interest statement (Form 1098)', false, 6),
  ((select id from public.document_request_templates where slug = 'individual-tax-docreq'), 'Deductions', 'Property tax statements', false, 7),
  ((select id from public.document_request_templates where slug = 'individual-tax-docreq'), 'Deductions', 'Charitable contribution receipts', false, 8),
  ((select id from public.document_request_templates where slug = 'individual-tax-docreq'), 'Deductions', 'Student loan interest statement (Form 1098-E)', false, 9),
  ((select id from public.document_request_templates where slug = 'individual-tax-docreq'), 'Health Coverage', 'Form 1095-A/B/C', false, 10);

insert into public.engagement_letter_templates (name, slug, body_html, merge_fields, requires_signature, status) values
  ('Individual Tax Preparation Engagement Letter', 'individual-tax-engagement-letter',
   '<p>Dear {{client_name}},</p><p>This letter confirms the terms of our engagement to prepare your {{tax_year}} individual federal and state income tax return(s). {{firm_name}} will prepare your return based on information you provide; we do not audit or verify the information. Our fee for this engagement is {{fee_amount}}, due {{payment_terms}}.</p><p>Please sign below to confirm your acceptance of these terms.</p>',
   '["client_name", "tax_year", "firm_name", "fee_amount", "payment_terms"]'::jsonb,
   true, 'published');

insert into public.email_templates (name, slug, category, subject, body_html, merge_fields, status) values
  ('Individual Return Ready For Signature', 'individual-tax-ready-email', 'case_update', 'Your {{tax_year}} tax return is ready to sign, {{client_first_name}}',
   '<p>Hi {{client_first_name}},</p><p>Your {{tax_year}} individual tax return has been prepared and reviewed. Please log in to your client portal to review and sign.</p><p>Thanks,<br/>{{firm_name}}</p>',
   '["client_first_name", "tax_year", "firm_name"]'::jsonb, 'published');

insert into public.sms_templates (name, slug, body, merge_fields, status) values
  ('Individual Return Ready SMS', 'individual-tax-ready-sms', 'Hi {{client_first_name}}, your {{tax_year}} tax return is ready to review and sign in your {{firm_name}} client portal.',
   '["client_first_name", "tax_year", "firm_name"]'::jsonb, 'published');

insert into public.pricing_rules (name, slug, pricing_method, base_amount, minimum_amount, maximum_amount, allow_override, status) values
  ('Individual Tax Prep - Flat Fee', 'individual-tax-pricing', 'flat_fee', 250.00, 150.00, 600.00, true, 'published');

insert into public.billing_rules (name, slug, invoice_timing, payment_before_release, automatic_reminders, status) values
  ('Individual Tax Prep - Pay Before Release', 'individual-tax-billing', 'after_work', true, '[{"days_after_due": 3}, {"days_after_due": 10}]'::jsonb, 'published');

insert into public.services (
  name, slug, description, service_category_id, estimated_duration_minutes, default_price,
  pricing_rule_id, billing_rule_id, process_id, pipeline_id, organizer_template_id,
  document_request_template_id, engagement_letter_template_id,
  is_bookable, is_portal_visible, requires_organizer, requires_engagement_letter,
  requires_documents, requires_signature, requires_review, requires_invoice, requires_payment_before_release,
  display_order, tags, status
) values (
  'Individual Tax Preparation', 'individual-tax-preparation', 'Preparation and e-filing of Form 1040 individual federal and state income tax returns.',
  (select id from public.service_categories where slug = 'individual-tax'), 90, 250.00,
  (select id from public.pricing_rules where slug = 'individual-tax-pricing'),
  (select id from public.billing_rules where slug = 'individual-tax-billing'),
  (select id from public.processes where slug = 'individual-tax-prep-process'),
  (select id from public.pipelines where slug = 'individual-tax-prep-pipeline'),
  (select id from public.organizer_templates where slug = 'individual-tax-organizer'),
  (select id from public.document_request_templates where slug = 'individual-tax-docreq'),
  (select id from public.engagement_letter_templates where slug = 'individual-tax-engagement-letter'),
  true, true, true, true, true, true, true, true, true,
  1, array['individual', '1040', 'flagship'], 'published'
);

insert into public.blueprints (name, slug, description, category, status) values
  ('Individual Tax Preparation', 'individual-tax-preparation-blueprint', 'Complete configuration for individual Form 1040 preparation: intake, documents, prep, review, e-file, delivery.', 'individual', 'published');

insert into public.blueprint_components (blueprint_id, component_type, component_id, is_primary)
select (select id from public.blueprints where slug = 'individual-tax-preparation-blueprint'), t.component_type, t.component_id, t.is_primary
from (values
  ('service_categories', (select id from public.service_categories where slug = 'individual-tax'), false),
  ('services', (select id from public.services where slug = 'individual-tax-preparation'), true),
  ('processes', (select id from public.processes where slug = 'individual-tax-prep-process'), false),
  ('pipelines', (select id from public.pipelines where slug = 'individual-tax-prep-pipeline'), false),
  ('organizer_templates', (select id from public.organizer_templates where slug = 'individual-tax-organizer'), false),
  ('document_request_templates', (select id from public.document_request_templates where slug = 'individual-tax-docreq'), false),
  ('engagement_letter_templates', (select id from public.engagement_letter_templates where slug = 'individual-tax-engagement-letter'), false),
  ('email_templates', (select id from public.email_templates where slug = 'individual-tax-ready-email'), false),
  ('sms_templates', (select id from public.sms_templates where slug = 'individual-tax-ready-sms'), false),
  ('pricing_rules', (select id from public.pricing_rules where slug = 'individual-tax-pricing'), false),
  ('billing_rules', (select id from public.billing_rules where slug = 'individual-tax-billing'), false)
) as t(component_type, component_id, is_primary);

insert into public.processes (name, slug, description, status) values
  ('Business Tax Preparation', 'business-tax-prep-process', 'Workflow for preparing business returns (1120, 1120-S, 1065).', 'published');

insert into public.process_stages (process_id, name, display_order, completion_rule, due_date_rule) values
  ((select id from public.processes where slug = 'business-tax-prep-process'), 'Intake & Organizer', 1, 'all_tasks_complete', '{"basis":"case_created","offset_days":7}'),
  ((select id from public.processes where slug = 'business-tax-prep-process'), 'Document Collection', 2, 'all_tasks_complete', '{"basis":"stage_entry","offset_days":14}'),
  ((select id from public.processes where slug = 'business-tax-prep-process'), 'Preparation', 3, 'all_tasks_complete', '{"basis":"stage_entry","offset_days":7}'),
  ((select id from public.processes where slug = 'business-tax-prep-process'), 'Review', 4, 'manual_only', '{"basis":"stage_entry","offset_days":3}'),
  ((select id from public.processes where slug = 'business-tax-prep-process'), 'Signature & E-File', 5, 'all_tasks_complete', '{"basis":"stage_entry","offset_days":3}'),
  ((select id from public.processes where slug = 'business-tax-prep-process'), 'Filed & Delivered', 6, 'manual_only', '{}');

update public.process_stages set reviewer_role_id = (select id from public.roles where slug = 'ero' and workspace_id is null)
where process_id = (select id from public.processes where slug = 'business-tax-prep-process') and name = 'Review';

insert into public.process_tasks (process_stage_id, name, display_order, is_required, assignee_role_id) values
  ((select id from public.process_stages where name = 'Intake & Organizer' and process_id = (select id from public.processes where slug = 'business-tax-prep-process')), 'Send business organizer to client', 1, true, (select id from public.roles where slug = 'ptin_preparer' and workspace_id is null)),
  ((select id from public.process_stages where name = 'Document Collection' and process_id = (select id from public.processes where slug = 'business-tax-prep-process')), 'Send document request', 1, true, (select id from public.roles where slug = 'staff' and workspace_id is null)),
  ((select id from public.process_stages where name = 'Document Collection' and process_id = (select id from public.processes where slug = 'business-tax-prep-process')), 'Reconcile books to trial balance', 2, true, (select id from public.roles where slug = 'ptin_preparer' and workspace_id is null)),
  ((select id from public.process_stages where name = 'Preparation' and process_id = (select id from public.processes where slug = 'business-tax-prep-process')), 'Prepare business return and K-1s', 1, true, (select id from public.roles where slug = 'ptin_preparer' and workspace_id is null)),
  ((select id from public.process_stages where name = 'Review' and process_id = (select id from public.processes where slug = 'business-tax-prep-process')), 'Reviewer sign-off', 1, true, (select id from public.roles where slug = 'ero' and workspace_id is null)),
  ((select id from public.process_stages where name = 'Signature & E-File' and process_id = (select id from public.processes where slug = 'business-tax-prep-process')), 'Collect signatures (8879 / officer signature)', 1, true, (select id from public.roles where slug = 'staff' and workspace_id is null)),
  ((select id from public.process_stages where name = 'Signature & E-File' and process_id = (select id from public.processes where slug = 'business-tax-prep-process')), 'Transmit return and issue K-1s', 2, true, (select id from public.roles where slug = 'ero' and workspace_id is null)),
  ((select id from public.process_stages where name = 'Filed & Delivered' and process_id = (select id from public.processes where slug = 'business-tax-prep-process')), 'Deliver completed return to client portal', 1, true, (select id from public.roles where slug = 'staff' and workspace_id is null));

insert into public.pipelines (name, slug, description, status) values
  ('Business Tax Returns', 'business-tax-prep-pipeline', 'Kanban board for tracking business returns.', 'published');

insert into public.pipeline_stages (pipeline_id, name, display_order, color, is_terminal) values
  ((select id from public.pipelines where slug = 'business-tax-prep-pipeline'), 'Prospective Clients', 1, '#94a3b8', false),
  ((select id from public.pipelines where slug = 'business-tax-prep-pipeline'), 'Active Returns', 2, '#3b82f6', false),
  ((select id from public.pipelines where slug = 'business-tax-prep-pipeline'), 'Waiting For Documents', 3, '#f59e0b', false),
  ((select id from public.pipelines where slug = 'business-tax-prep-pipeline'), 'Review Queue', 4, '#a855f7', false),
  ((select id from public.pipelines where slug = 'business-tax-prep-pipeline'), 'Ready To Release', 5, '#22c55e', false),
  ((select id from public.pipelines where slug = 'business-tax-prep-pipeline'), 'Completed', 6, '#16a34a', true);

insert into public.organizer_templates (name, slug, description, status) values
  ('Business Tax Organizer', 'business-tax-organizer', 'Intake organizer for business entity clients.', 'published');

insert into public.organizer_fields (organizer_template_id, field_type, label, display_order, is_required) values
  ((select id from public.organizer_templates where slug = 'business-tax-organizer'), 'short_text', 'Legal Business Name', 1, true),
  ((select id from public.organizer_templates where slug = 'business-tax-organizer'), 'ein', 'Employer Identification Number (EIN)', 2, true),
  ((select id from public.organizer_templates where slug = 'business-tax-organizer'), 'address', 'Principal Business Address', 3, true),
  ((select id from public.organizer_templates where slug = 'business-tax-organizer'), 'date', 'Tax Year End', 4, true),
  ((select id from public.organizer_templates where slug = 'business-tax-organizer'), 'currency', 'Estimated Gross Receipts', 6, false),
  ((select id from public.organizer_templates where slug = 'business-tax-organizer'), 'file_upload', 'Prior Year Business Return', 7, false),
  ((select id from public.organizer_templates where slug = 'business-tax-organizer'), 'signature', 'Authorized Officer Signature', 8, true);

insert into public.organizer_fields (organizer_template_id, field_type, label, display_order, is_required, options) values
  ((select id from public.organizer_templates where slug = 'business-tax-organizer'), 'dropdown', 'Entity Type', 5, true,
    '["Sole Proprietorship", "Partnership", "S-Corporation", "C-Corporation", "LLC"]'::jsonb);

insert into public.document_request_templates (name, slug, description, status) values
  ('Business Tax Document Request', 'business-tax-docreq', 'Standard document checklist for business clients.', 'published');

insert into public.document_request_items (document_request_template_id, category, name, is_required, display_order) values
  ((select id from public.document_request_templates where slug = 'business-tax-docreq'), 'Prior Filings', 'Prior year business tax return', true, 1),
  ((select id from public.document_request_templates where slug = 'business-tax-docreq'), 'Financials', 'Profit & loss statement', true, 2),
  ((select id from public.document_request_templates where slug = 'business-tax-docreq'), 'Financials', 'Balance sheet', true, 3),
  ((select id from public.document_request_templates where slug = 'business-tax-docreq'), 'Payroll', 'Payroll reports and W-3', false, 4),
  ((select id from public.document_request_templates where slug = 'business-tax-docreq'), 'Payroll', '1099s issued to contractors', false, 5),
  ((select id from public.document_request_templates where slug = 'business-tax-docreq'), 'Assets', 'Fixed asset purchase/disposal records', false, 6),
  ((select id from public.document_request_templates where slug = 'business-tax-docreq'), 'Other', 'Business mileage log', false, 7),
  ((select id from public.document_request_templates where slug = 'business-tax-docreq'), 'Other', 'EIN confirmation letter (new clients)', false, 8);

insert into public.engagement_letter_templates (name, slug, body_html, merge_fields, requires_signature, status) values
  ('Business Tax Preparation Engagement Letter', 'business-tax-engagement-letter',
   '<p>Dear {{client_name}},</p><p>This letter confirms our engagement to prepare {{business_name}}''s {{tax_year}} business income tax return. {{firm_name}} will rely on the financial records and information you provide. Our fee for this engagement is {{fee_amount}}, due {{payment_terms}}.</p><p>Please sign below to confirm acceptance.</p>',
   '["client_name", "business_name", "tax_year", "firm_name", "fee_amount", "payment_terms"]'::jsonb,
   true, 'published');

insert into public.email_templates (name, slug, category, subject, body_html, merge_fields, status) values
  ('Business Return Ready For Signature', 'business-tax-ready-email', 'case_update', 'Your {{tax_year}} business return is ready to sign',
   '<p>Hi {{client_first_name}},</p><p>{{business_name}}''s {{tax_year}} business tax return has been prepared and reviewed. Please log in to your client portal to review and sign.</p><p>Thanks,<br/>{{firm_name}}</p>',
   '["client_first_name", "business_name", "tax_year", "firm_name"]'::jsonb, 'published');

insert into public.sms_templates (name, slug, body, merge_fields, status) values
  ('Business Return Ready SMS', 'business-tax-ready-sms', 'Hi {{client_first_name}}, {{business_name}}''s {{tax_year}} business return is ready to review and sign in your {{firm_name}} client portal.',
   '["client_first_name", "business_name", "tax_year", "firm_name"]'::jsonb, 'published');

insert into public.pricing_rules (name, slug, pricing_method, base_amount, minimum_amount, maximum_amount, allow_override, status) values
  ('Business Tax Prep - Flat Fee', 'business-tax-pricing', 'flat_fee', 750.00, 500.00, 2500.00, true, 'published');

insert into public.billing_rules (name, slug, invoice_timing, deposit_required, deposit_percent, payment_before_release, automatic_reminders, status) values
  ('Business Tax Prep - Deposit + Pay Before Release', 'business-tax-billing', 'before_work', true, 50.00, true, '[{"days_after_due": 3}, {"days_after_due": 10}]'::jsonb, 'published');

insert into public.services (
  name, slug, description, service_category_id, estimated_duration_minutes, default_price,
  pricing_rule_id, billing_rule_id, process_id, pipeline_id, organizer_template_id,
  document_request_template_id, engagement_letter_template_id,
  is_bookable, is_portal_visible, requires_organizer, requires_engagement_letter,
  requires_documents, requires_signature, requires_review, requires_invoice, requires_payment_before_release,
  display_order, tags, status
) values (
  'Business Tax Preparation', 'business-tax-preparation', 'Preparation and e-filing of business income tax returns (1120, 1120-S, 1065) including K-1 issuance.',
  (select id from public.service_categories where slug = 'business-tax'), 180, 750.00,
  (select id from public.pricing_rules where slug = 'business-tax-pricing'),
  (select id from public.billing_rules where slug = 'business-tax-billing'),
  (select id from public.processes where slug = 'business-tax-prep-process'),
  (select id from public.pipelines where slug = 'business-tax-prep-pipeline'),
  (select id from public.organizer_templates where slug = 'business-tax-organizer'),
  (select id from public.document_request_templates where slug = 'business-tax-docreq'),
  (select id from public.engagement_letter_templates where slug = 'business-tax-engagement-letter'),
  false, true, true, true, true, true, true, true, true,
  2, array['business', '1120', '1065'], 'published'
);

insert into public.blueprints (name, slug, description, category, status) values
  ('Business Tax Preparation', 'business-tax-preparation-blueprint', 'Complete configuration for business return preparation: intake, documents, prep, review, e-file, K-1 delivery.', 'business', 'published');

insert into public.blueprint_components (blueprint_id, component_type, component_id, is_primary)
select (select id from public.blueprints where slug = 'business-tax-preparation-blueprint'), t.component_type, t.component_id, t.is_primary
from (values
  ('service_categories', (select id from public.service_categories where slug = 'business-tax'), false),
  ('services', (select id from public.services where slug = 'business-tax-preparation'), true),
  ('processes', (select id from public.processes where slug = 'business-tax-prep-process'), false),
  ('pipelines', (select id from public.pipelines where slug = 'business-tax-prep-pipeline'), false),
  ('organizer_templates', (select id from public.organizer_templates where slug = 'business-tax-organizer'), false),
  ('document_request_templates', (select id from public.document_request_templates where slug = 'business-tax-docreq'), false),
  ('engagement_letter_templates', (select id from public.engagement_letter_templates where slug = 'business-tax-engagement-letter'), false),
  ('email_templates', (select id from public.email_templates where slug = 'business-tax-ready-email'), false),
  ('sms_templates', (select id from public.sms_templates where slug = 'business-tax-ready-sms'), false),
  ('pricing_rules', (select id from public.pricing_rules where slug = 'business-tax-pricing'), false),
  ('billing_rules', (select id from public.billing_rules where slug = 'business-tax-billing'), false)
) as t(component_type, component_id, is_primary);
