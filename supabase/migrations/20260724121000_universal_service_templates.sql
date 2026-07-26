-- Platform service templates for the pipelines created in
-- 20260724120000_universal_service_pipelines.sql.
--
-- Same safety facts as that migration apply here: service_templates rows
-- for the 5 pre-existing templates are updated by their real, known id
-- (preserving it); the 5 new templates are inserted only if no row with
-- that template_name already exists as a platform template. Their child
-- rows (service_template_tasks/documents/forms) carry no incoming
-- foreign key from tasks/documents/client_form_assignments -- those only
-- ever copy from a template at activation time via
-- apply_service_template_to_client(), never reference the template row
-- afterward -- so each template's child rows are simply deleted and
-- re-inserted in full on every run: idempotent by construction, and
-- never touches an already-activated client's own tasks/documents/forms.
--
-- service_template_forms.form_template_id only ever references one of
-- the 4 real platform form_templates confirmed live before writing this
-- (Business Application Form, New Client Intake Form, Payroll Onboarding
-- Form, W-9 Request Form) -- never a fabricated id, and never one of the
-- two workspace-owned form templates that also exist.

-- =====================================================================
-- Individual Tax Preparation (existing template a308804f-...)
-- =====================================================================
update public.service_templates
set default_pipeline_id = (select id from public.pipelines where pipeline_name = 'Individual Tax Preparation Pipeline' and is_platform_template = true and workspace_id is null),
    description = 'Individual (1040) tax return preparation, from consultation through filing.',
    is_active = true
where id = 'a308804f-61f6-43f6-aa34-d18d01dfb74b';

delete from public.service_template_tasks where service_template_id = 'a308804f-61f6-43f6-aa34-d18d01dfb74b';
insert into public.service_template_tasks (service_template_id, task_title, task_description, priority, due_offset_days, sort_order)
values
  ('a308804f-61f6-43f6-aa34-d18d01dfb74b', 'Complete consultation, when applicable', 'Confirm scope and answer initial questions with the client.', 'Normal', 0, 1),
  ('a308804f-61f6-43f6-aa34-d18d01dfb74b', 'Send engagement letter', 'Send engagement terms for client acceptance.', 'Normal', 1, 2),
  ('a308804f-61f6-43f6-aa34-d18d01dfb74b', 'Review completed intake', 'Confirm the client intake questionnaire is complete.', 'Normal', 2, 3),
  ('a308804f-61f6-43f6-aa34-d18d01dfb74b', 'Send document request checklist', 'Trigger the tax document request to the client.', 'Normal', 3, 4),
  ('a308804f-61f6-43f6-aa34-d18d01dfb74b', 'Review received documents', 'Confirm all required documents are in and legible.', 'Normal', 7, 5),
  ('a308804f-61f6-43f6-aa34-d18d01dfb74b', 'Follow up on missing information', 'Contact the client about any outstanding documents or answers.', 'Normal', 8, 6),
  ('a308804f-61f6-43f6-aa34-d18d01dfb74b', 'Prepare return', 'Prepare the return in tax software.', 'High', 12, 7),
  ('a308804f-61f6-43f6-aa34-d18d01dfb74b', 'Perform internal review', 'Second-preparer or self-review before client delivery.', 'High', 15, 8),
  ('a308804f-61f6-43f6-aa34-d18d01dfb74b', 'Send for client review/signatures', 'Route through e-signature for client review and signature.', 'High', 17, 9),
  ('a308804f-61f6-43f6-aa34-d18d01dfb74b', 'File return and confirm acceptance', 'Confirm IRS/state acceptance and notify the client.', 'High', 20, 10);

delete from public.service_template_documents where service_template_id = 'a308804f-61f6-43f6-aa34-d18d01dfb74b';
insert into public.service_template_documents (service_template_id, document_name, document_category, client_message, is_required, sort_order)
values
  ('a308804f-61f6-43f6-aa34-d18d01dfb74b', 'Prior-year tax return', 'Tax Document', 'Please upload last year''s filed tax return, if you have one.', false, 1),
  ('a308804f-61f6-43f6-aa34-d18d01dfb74b', 'W-2s and 1099s', 'Tax Document', 'Please upload all W-2 and 1099 forms you received this year.', true, 2),
  ('a308804f-61f6-43f6-aa34-d18d01dfb74b', 'Government-issued photo ID', 'Identification', 'Please upload a copy of your driver''s license or state ID.', true, 3),
  ('a308804f-61f6-43f6-aa34-d18d01dfb74b', 'Signed engagement letter', 'Engagement', 'Please review and sign the engagement letter to begin.', true, 4);

delete from public.service_template_forms where service_template_id = 'a308804f-61f6-43f6-aa34-d18d01dfb74b';
insert into public.service_template_forms (service_template_id, form_template_id, client_message, due_offset_days, sort_order)
select 'a308804f-61f6-43f6-aa34-d18d01dfb74b', id, 'Please complete this intake form so we can get started.', 2, 1
from public.form_templates where template_name = 'New Client Intake Form' and is_platform_template = true and workspace_id is null;

-- =====================================================================
-- Business Tax Preparation (existing template fb856ca6-...). Neutral
-- signature language ("signature authorization") instead of "8879" --
-- Form 8879 is the individual e-file signature authorization; business
-- returns use different forms (8879-C/8879-S/8879-PE) depending on
-- entity type, so a generic label is used instead of naming one.
-- =====================================================================
update public.service_templates
set default_pipeline_id = (select id from public.pipelines where pipeline_name = 'Business Tax Preparation Pipeline' and is_platform_template = true and workspace_id is null),
    description = 'Business tax return preparation, from consultation through filing.',
    is_active = true
where id = 'fb856ca6-b12b-4165-abe3-fb7cba9c3f95';

delete from public.service_template_tasks where service_template_id = 'fb856ca6-b12b-4165-abe3-fb7cba9c3f95';
insert into public.service_template_tasks (service_template_id, task_title, task_description, priority, due_offset_days, sort_order)
values
  ('fb856ca6-b12b-4165-abe3-fb7cba9c3f95', 'Complete consultation, when applicable', 'Confirm scope and answer initial questions with the client.', 'Normal', 0, 1),
  ('fb856ca6-b12b-4165-abe3-fb7cba9c3f95', 'Send engagement letter', 'Send engagement terms for client acceptance.', 'Normal', 1, 2),
  ('fb856ca6-b12b-4165-abe3-fb7cba9c3f95', 'Review business intake and prior-year return', 'Confirm books are reconciled and intake is complete before starting.', 'Normal', 3, 3),
  ('fb856ca6-b12b-4165-abe3-fb7cba9c3f95', 'Send document request checklist', 'Trigger the business tax document request to the client.', 'Normal', 4, 4),
  ('fb856ca6-b12b-4165-abe3-fb7cba9c3f95', 'Review received financials and documents', 'Confirm all required documents are in and legible.', 'Normal', 7, 5),
  ('fb856ca6-b12b-4165-abe3-fb7cba9c3f95', 'Follow up on missing information', 'Contact the client about any outstanding documents or answers.', 'Normal', 8, 6),
  ('fb856ca6-b12b-4165-abe3-fb7cba9c3f95', 'Prepare return', 'Prepare the business return in tax software.', 'High', 12, 7),
  ('fb856ca6-b12b-4165-abe3-fb7cba9c3f95', 'Perform internal review', 'Second-preparer or self-review before client delivery.', 'High', 16, 8),
  ('fb856ca6-b12b-4165-abe3-fb7cba9c3f95', 'Send signature authorization', 'Route the appropriate e-file signature authorization for the entity type.', 'High', 18, 9),
  ('fb856ca6-b12b-4165-abe3-fb7cba9c3f95', 'File return / confirm acceptance', 'Confirm IRS/state acceptance and notify the client.', 'High', 21, 10);

delete from public.service_template_documents where service_template_id = 'fb856ca6-b12b-4165-abe3-fb7cba9c3f95';
insert into public.service_template_documents (service_template_id, document_name, document_category, client_message, is_required, sort_order)
values
  ('fb856ca6-b12b-4165-abe3-fb7cba9c3f95', 'Prior-year business tax return', 'Tax Document', 'Please upload last year''s filed business tax return, if you have one.', false, 1),
  ('fb856ca6-b12b-4165-abe3-fb7cba9c3f95', 'Year-end financial statements', 'Financial Statement', 'Please upload your year-end profit & loss and balance sheet.', true, 2),
  ('fb856ca6-b12b-4165-abe3-fb7cba9c3f95', 'EIN confirmation letter', 'Tax Document', 'Please upload your IRS EIN confirmation letter, if available.', false, 3),
  ('fb856ca6-b12b-4165-abe3-fb7cba9c3f95', 'Signed engagement letter', 'Engagement', 'Please review and sign the engagement letter to begin.', true, 4);

delete from public.service_template_forms where service_template_id = 'fb856ca6-b12b-4165-abe3-fb7cba9c3f95';
insert into public.service_template_forms (service_template_id, form_template_id, client_message, due_offset_days, sort_order)
select 'fb856ca6-b12b-4165-abe3-fb7cba9c3f95', id, 'Please complete this intake form so we can get started.', 2, 1
from public.form_templates where template_name = 'New Client Intake Form' and is_platform_template = true and workspace_id is null;

-- =====================================================================
-- Business Formation / LLC Formation (existing template edf0196b-...).
-- One common template/pipeline for both, per product spec -- no separate
-- LLC template is created.
-- =====================================================================
update public.service_templates
set default_pipeline_id = '507e8f60-979e-4465-bbfc-39f3f9de75f0',
    description = 'LLC and business entity formation, from consultation through delivered formation documents.',
    is_active = true
where id = 'edf0196b-dcc4-4851-9e01-146b99f3b068';

delete from public.service_template_tasks where service_template_id = 'edf0196b-dcc4-4851-9e01-146b99f3b068';
insert into public.service_template_tasks (service_template_id, task_title, task_description, priority, due_offset_days, sort_order)
values
  ('edf0196b-dcc4-4851-9e01-146b99f3b068', 'Complete consultation', 'Confirm scope and answer initial questions with the client.', 'Normal', 0, 1),
  ('edf0196b-dcc4-4851-9e01-146b99f3b068', 'Send engagement letter', 'Send engagement terms for client acceptance.', 'Normal', 1, 2),
  ('edf0196b-dcc4-4851-9e01-146b99f3b068', 'Review formation intake', 'Confirm the client formation questionnaire is complete.', 'Normal', 2, 3),
  ('edf0196b-dcc4-4851-9e01-146b99f3b068', 'Confirm entity details', 'Entity type, state, owners, registered agent.', 'Normal', 3, 4),
  ('edf0196b-dcc4-4851-9e01-146b99f3b068', 'Perform name availability review', 'Check the proposed business name for availability with the state.', 'Normal', 5, 5),
  ('edf0196b-dcc4-4851-9e01-146b99f3b068', 'Prepare filing', 'Prepare Articles of Organization/Incorporation for filing.', 'High', 7, 6),
  ('edf0196b-dcc4-4851-9e01-146b99f3b068', 'Submit state filing', 'File formation documents with the state.', 'High', 8, 7),
  ('edf0196b-dcc4-4851-9e01-146b99f3b068', 'Request EIN', 'Apply for EIN via IRS.', 'High', 10, 8),
  ('edf0196b-dcc4-4851-9e01-146b99f3b068', 'Prepare operating agreement', 'Draft and send for signature.', 'Normal', 12, 9),
  ('edf0196b-dcc4-4851-9e01-146b99f3b068', 'Deliver formation documents', 'Send final formation documents to the client.', 'Normal', 14, 10),
  ('edf0196b-dcc4-4851-9e01-146b99f3b068', 'Set compliance reminders', 'BOI report, annual report, and initial report deadlines.', 'Normal', 14, 11);

delete from public.service_template_documents where service_template_id = 'edf0196b-dcc4-4851-9e01-146b99f3b068';
insert into public.service_template_documents (service_template_id, document_name, document_category, client_message, is_required, sort_order)
values
  ('edf0196b-dcc4-4851-9e01-146b99f3b068', 'Signed engagement letter', 'Engagement', 'Please review and sign the engagement letter to begin.', true, 1),
  ('edf0196b-dcc4-4851-9e01-146b99f3b068', 'Owner/member identification', 'Identification', 'Please upload a government-issued ID for each owner or member.', true, 2),
  ('edf0196b-dcc4-4851-9e01-146b99f3b068', 'Registered agent information', 'Formation Document', 'Please provide your registered agent''s name and address, if already selected.', false, 3);

delete from public.service_template_forms where service_template_id = 'edf0196b-dcc4-4851-9e01-146b99f3b068';
insert into public.service_template_forms (service_template_id, form_template_id, client_message, due_offset_days, sort_order)
select 'edf0196b-dcc4-4851-9e01-146b99f3b068', id, 'Please complete this application so we can begin your formation filing.', 2, 1
from public.form_templates where template_name = 'Business Application Form' and is_platform_template = true and workspace_id is null;

-- =====================================================================
-- Bookkeeping Client Onboarding (existing template 5e5fddd1-..., renamed
-- from "Monthly Bookkeeping" -- its old task list was monthly-cycle work
-- that belongs to the future Monthly Bookkeeping Period Pipeline, not an
-- onboarding workflow; service_type stays 'bookkeeping' so it keeps
-- matching the client_setup_options code and the Requested Services UI).
-- =====================================================================
update public.service_templates
set template_name = 'Bookkeeping Client Onboarding',
    default_pipeline_id = (select id from public.pipelines where pipeline_name = 'Bookkeeping Client Onboarding Pipeline' and is_platform_template = true and workspace_id is null),
    description = 'Bring a new bookkeeping client from consultation to active recurring service.',
    is_active = true
where id = '5e5fddd1-daa3-4614-b015-57d3ffe560e5';

delete from public.service_template_tasks where service_template_id = '5e5fddd1-daa3-4614-b015-57d3ffe560e5';
insert into public.service_template_tasks (service_template_id, task_title, task_description, priority, due_offset_days, sort_order)
values
  ('5e5fddd1-daa3-4614-b015-57d3ffe560e5', 'Complete consultation', 'Confirm scope and answer initial questions with the client.', 'Normal', 0, 1),
  ('5e5fddd1-daa3-4614-b015-57d3ffe560e5', 'Send engagement letter', 'Send engagement terms for client acceptance.', 'Normal', 1, 2),
  ('5e5fddd1-daa3-4614-b015-57d3ffe560e5', 'Review onboarding intake', 'Confirm the client onboarding questionnaire is complete.', 'Normal', 2, 3),
  ('5e5fddd1-daa3-4614-b015-57d3ffe560e5', 'Collect access and historical documents', 'Request software access and historical statements from the client.', 'Normal', 4, 4),
  ('5e5fddd1-daa3-4614-b015-57d3ffe560e5', 'Complete account setup', 'Configure chart of accounts and bookkeeping software.', 'Normal', 7, 5),
  ('5e5fddd1-daa3-4614-b015-57d3ffe560e5', 'Perform historical review', 'Review prior-period books for accuracy.', 'Normal', 10, 6),
  ('5e5fddd1-daa3-4614-b015-57d3ffe560e5', 'Confirm ready for recurring service', 'Confirm onboarding is complete and schedule the first recurring period.', 'Normal', 13, 7);

delete from public.service_template_documents where service_template_id = '5e5fddd1-daa3-4614-b015-57d3ffe560e5';
insert into public.service_template_documents (service_template_id, document_name, document_category, client_message, is_required, sort_order)
values
  ('5e5fddd1-daa3-4614-b015-57d3ffe560e5', 'Bank and credit card statements (last 3 months)', 'Financial Statement', 'Please upload your last 3 months of bank and credit card statements.', true, 1),
  ('5e5fddd1-daa3-4614-b015-57d3ffe560e5', 'Prior bookkeeping file or software access', 'Bookkeeping Document', 'Please share access to your existing bookkeeping software, if any.', false, 2),
  ('5e5fddd1-daa3-4614-b015-57d3ffe560e5', 'Chart of accounts (if existing)', 'Bookkeeping Document', 'Please upload your existing chart of accounts, if you have one.', false, 3);

delete from public.service_template_forms where service_template_id = '5e5fddd1-daa3-4614-b015-57d3ffe560e5';
insert into public.service_template_forms (service_template_id, form_template_id, client_message, due_offset_days, sort_order)
select '5e5fddd1-daa3-4614-b015-57d3ffe560e5', id, 'Please complete this intake form so we can get started.', 2, 1
from public.form_templates where template_name = 'New Client Intake Form' and is_platform_template = true and workspace_id is null;

-- =====================================================================
-- Payroll Onboarding (existing template 82fa89bf-..., renamed from
-- "Payroll Services" -- its old task list was per-run processing work
-- that belongs to an ongoing payroll-run workflow, not onboarding;
-- service_type stays 'payroll').
-- =====================================================================
update public.service_templates
set template_name = 'Payroll Onboarding',
    default_pipeline_id = '9b33b487-9e4e-4bcb-b4c4-1a3fb7e9ba08',
    description = 'Onboard a new payroll client, from consultation through the first live run.',
    is_active = true
where id = '82fa89bf-2de2-4e37-9f07-c610ae7abe41';

delete from public.service_template_tasks where service_template_id = '82fa89bf-2de2-4e37-9f07-c610ae7abe41';
insert into public.service_template_tasks (service_template_id, task_title, task_description, priority, due_offset_days, sort_order)
values
  ('82fa89bf-2de2-4e37-9f07-c610ae7abe41', 'Complete consultation', 'Confirm scope and answer initial questions with the client.', 'Normal', 0, 1),
  ('82fa89bf-2de2-4e37-9f07-c610ae7abe41', 'Send engagement letter', 'Send engagement terms for client acceptance.', 'Normal', 1, 2),
  ('82fa89bf-2de2-4e37-9f07-c610ae7abe41', 'Review payroll intake', 'Confirm the client payroll intake questionnaire is complete.', 'Normal', 2, 3),
  ('82fa89bf-2de2-4e37-9f07-c610ae7abe41', 'Collect company and employee information', 'Request company details and employee data needed for setup.', 'Normal', 4, 4),
  ('82fa89bf-2de2-4e37-9f07-c610ae7abe41', 'Set up payroll and tax accounts', 'Configure the payroll system and federal/state tax accounts.', 'High', 8, 5),
  ('82fa89bf-2de2-4e37-9f07-c610ae7abe41', 'Run test payroll', 'Process a test run to confirm setup before going live.', 'High', 11, 6),
  ('82fa89bf-2de2-4e37-9f07-c610ae7abe41', 'Confirm ready to process', 'Verify setup is correct and payroll is ready for its first live run.', 'High', 13, 7),
  ('82fa89bf-2de2-4e37-9f07-c610ae7abe41', 'Transition to active payroll processing', 'Move the client into ongoing payroll processing.', 'Normal', 14, 8);

delete from public.service_template_documents where service_template_id = '82fa89bf-2de2-4e37-9f07-c610ae7abe41';
insert into public.service_template_documents (service_template_id, document_name, document_category, client_message, is_required, sort_order)
values
  ('82fa89bf-2de2-4e37-9f07-c610ae7abe41', 'Prior payroll reports (if switching providers)', 'Payroll Document', 'Please upload recent payroll reports from your prior provider, if applicable.', false, 1),
  ('82fa89bf-2de2-4e37-9f07-c610ae7abe41', 'Employee W-4s / I-9s', 'Payroll Document', 'Please upload current W-4 and I-9 forms for each employee.', true, 2),
  ('82fa89bf-2de2-4e37-9f07-c610ae7abe41', 'Company EIN and state tax account numbers', 'Payroll Document', 'Please provide your EIN and state payroll tax account numbers.', true, 3),
  ('82fa89bf-2de2-4e37-9f07-c610ae7abe41', 'Voided check for direct deposit', 'Payroll Document', 'Please upload a voided check for setting up direct deposit.', false, 4);

delete from public.service_template_forms where service_template_id = '82fa89bf-2de2-4e37-9f07-c610ae7abe41';
insert into public.service_template_forms (service_template_id, form_template_id, client_message, due_offset_days, sort_order)
select '82fa89bf-2de2-4e37-9f07-c610ae7abe41', id, 'Please complete this form so we can set up your payroll.', 2, 1
from public.form_templates where template_name = 'Payroll Onboarding Form' and is_platform_template = true and workspace_id is null;

-- =====================================================================
-- Cleanup Bookkeeping (new template; matches client_setup_options code
-- 'cleanup_bookkeeping', currently offered on client intake with no
-- matching template).
-- =====================================================================
insert into public.service_templates (template_name, service_type, description, default_pipeline_id, is_active, is_platform_template, visibility_scope, workspace_id)
select 'Cleanup Bookkeeping', 'cleanup_bookkeeping', 'One-time historical bookkeeping cleanup, from consultation through delivered reports.',
  (select id from public.pipelines where pipeline_name = 'Cleanup Bookkeeping Pipeline' and is_platform_template = true and workspace_id is null),
  true, true, 'workspace', null
where not exists (select 1 from public.service_templates where template_name = 'Cleanup Bookkeeping' and is_platform_template = true and workspace_id is null);

delete from public.service_template_tasks where service_template_id = (select id from public.service_templates where template_name = 'Cleanup Bookkeeping' and is_platform_template = true and workspace_id is null);
insert into public.service_template_tasks (service_template_id, task_title, task_description, priority, due_offset_days, sort_order)
select t.id, x.task_title, x.task_description, x.priority, x.due_offset_days, x.sort_order
from (select id from public.service_templates where template_name = 'Cleanup Bookkeeping' and is_platform_template = true and workspace_id is null) t,
(values
  (1, 'Complete consultation', 'Confirm scope and answer initial questions with the client.', 'Normal', 0),
  (2, 'Send engagement letter', 'Send engagement terms for client acceptance.', 'Normal', 1),
  (3, 'Collect access and historical documents', 'Request software access and historical statements from the client.', 'Normal', 3),
  (4, 'Perform historical review', 'Review prior-period books to scope the cleanup.', 'Normal', 7),
  (5, 'Complete cleanup', 'Correct and categorize historical transactions.', 'High', 14),
  (6, 'Perform internal review', 'Review the cleaned-up books internally before delivery.', 'Normal', 17),
  (7, 'Deliver cleanup reports', 'Send finished reports to the client.', 'Normal', 19),
  (8, 'Confirm ready for recurring service', 'Confirm whether the client will move into ongoing bookkeeping.', 'Normal', 20)
) as x(sort_order, task_title, task_description, priority, due_offset_days);

delete from public.service_template_documents where service_template_id = (select id from public.service_templates where template_name = 'Cleanup Bookkeeping' and is_platform_template = true and workspace_id is null);
insert into public.service_template_documents (service_template_id, document_name, document_category, client_message, is_required, sort_order)
select t.id, x.document_name, x.document_category, x.client_message, x.is_required, x.sort_order
from (select id from public.service_templates where template_name = 'Cleanup Bookkeeping' and is_platform_template = true and workspace_id is null) t,
(values
  (1, 'Bank and credit card statements (full cleanup period)', 'Financial Statement', 'Please upload statements covering the full period that needs cleanup.', true),
  (2, 'Prior-year tax return (if available)', 'Tax Document', 'Please upload your most recent filed tax return, if available.', false),
  (3, 'Access to existing bookkeeping software', 'Bookkeeping Document', 'Please share access to your existing bookkeeping software, if any.', false)
) as x(sort_order, document_name, document_category, client_message, is_required);

delete from public.service_template_forms where service_template_id = (select id from public.service_templates where template_name = 'Cleanup Bookkeeping' and is_platform_template = true and workspace_id is null);
insert into public.service_template_forms (service_template_id, form_template_id, client_message, due_offset_days, sort_order)
select t.id, f.id, 'Please complete this intake form so we can get started.', 2, 1
from (select id from public.service_templates where template_name = 'Cleanup Bookkeeping' and is_platform_template = true and workspace_id is null) t,
     (select id from public.form_templates where template_name = 'New Client Intake Form' and is_platform_template = true and workspace_id is null) f;

-- =====================================================================
-- Tax Planning (new template; matches client_setup_options code
-- 'tax_planning').
-- =====================================================================
insert into public.service_templates (template_name, service_type, description, default_pipeline_id, is_active, is_platform_template, visibility_scope, workspace_id)
select 'Tax Planning', 'tax_planning', 'Proactive tax planning, from consultation through delivered recommendations.',
  (select id from public.pipelines where pipeline_name = 'Tax Planning Pipeline' and is_platform_template = true and workspace_id is null),
  true, true, 'workspace', null
where not exists (select 1 from public.service_templates where template_name = 'Tax Planning' and is_platform_template = true and workspace_id is null);

delete from public.service_template_tasks where service_template_id = (select id from public.service_templates where template_name = 'Tax Planning' and is_platform_template = true and workspace_id is null);
insert into public.service_template_tasks (service_template_id, task_title, task_description, priority, due_offset_days, sort_order)
select t.id, x.task_title, x.task_description, x.priority, x.due_offset_days, x.sort_order
from (select id from public.service_templates where template_name = 'Tax Planning' and is_platform_template = true and workspace_id is null) t,
(values
  (1, 'Complete consultation', 'Confirm scope and answer initial questions with the client.', 'Normal', 0),
  (2, 'Send engagement letter', 'Send engagement terms for client acceptance.', 'Normal', 1),
  (3, 'Send planning questionnaire', 'Trigger the tax planning questionnaire to the client.', 'Normal', 2),
  (4, 'Review received documents', 'Confirm supporting financial documents are in and legible.', 'Normal', 6),
  (5, 'Develop tax strategy', 'Develop planning strategies based on the client''s situation.', 'High', 10),
  (6, 'Perform internal review', 'Review proposed strategies internally for accuracy.', 'Normal', 13),
  (7, 'Present recommendations to client', 'Walk the client through the proposed strategies.', 'Normal', 16),
  (8, 'Deliver final recommendations', 'Send the final written recommendations to the client.', 'Normal', 18),
  (9, 'Schedule follow-up', 'Set a follow-up to confirm strategies were implemented.', 'Normal', 20)
) as x(sort_order, task_title, task_description, priority, due_offset_days);

delete from public.service_template_documents where service_template_id = (select id from public.service_templates where template_name = 'Tax Planning' and is_platform_template = true and workspace_id is null);
insert into public.service_template_documents (service_template_id, document_name, document_category, client_message, is_required, sort_order)
select t.id, x.document_name, x.document_category, x.client_message, x.is_required, x.sort_order
from (select id from public.service_templates where template_name = 'Tax Planning' and is_platform_template = true and workspace_id is null) t,
(values
  (1, 'Most recent tax return', 'Tax Document', 'Please upload your most recently filed tax return.', true),
  (2, 'Current-year income summary', 'Financial Statement', 'Please provide a summary of your current-year income to date.', false)
) as x(sort_order, document_name, document_category, client_message, is_required);

-- =====================================================================
-- Business Consulting (new template; matches client_setup_options code
-- 'business_consulting').
-- =====================================================================
insert into public.service_templates (template_name, service_type, description, default_pipeline_id, is_active, is_platform_template, visibility_scope, workspace_id)
select 'Business Consulting', 'business_consulting', 'Business consulting engagement, from discovery through implementation planning.',
  (select id from public.pipelines where pipeline_name = 'Business Consulting Pipeline' and is_platform_template = true and workspace_id is null),
  true, true, 'workspace', null
where not exists (select 1 from public.service_templates where template_name = 'Business Consulting' and is_platform_template = true and workspace_id is null);

delete from public.service_template_tasks where service_template_id = (select id from public.service_templates where template_name = 'Business Consulting' and is_platform_template = true and workspace_id is null);
insert into public.service_template_tasks (service_template_id, task_title, task_description, priority, due_offset_days, sort_order)
select t.id, x.task_title, x.task_description, x.priority, x.due_offset_days, x.sort_order
from (select id from public.service_templates where template_name = 'Business Consulting' and is_platform_template = true and workspace_id is null) t,
(values
  (1, 'Complete consultation', 'Confirm scope and answer initial questions with the client.', 'Normal', 0),
  (2, 'Send engagement letter', 'Send engagement terms for client acceptance.', 'Normal', 1),
  (3, 'Send discovery intake', 'Trigger the discovery questionnaire to the client.', 'Normal', 2),
  (4, 'Review received documents', 'Confirm supporting business documents are in and legible.', 'Normal', 6),
  (5, 'Perform current-state review', 'Review the client''s current business operations.', 'Normal', 9),
  (6, 'Develop recommendations', 'Develop strategy and recommendations based on findings.', 'High', 13),
  (7, 'Present recommendations to client', 'Walk the client through the proposed recommendations.', 'Normal', 16),
  (8, 'Prepare implementation plan', 'Prepare a plan for implementing the recommendations.', 'Normal', 18),
  (9, 'Schedule follow-up', 'Set a follow-up to check on implementation progress.', 'Normal', 20)
) as x(sort_order, task_title, task_description, priority, due_offset_days);

delete from public.service_template_documents where service_template_id = (select id from public.service_templates where template_name = 'Business Consulting' and is_platform_template = true and workspace_id is null);
insert into public.service_template_documents (service_template_id, document_name, document_category, client_message, is_required, sort_order)
select t.id, x.document_name, x.document_category, x.client_message, x.is_required, x.sort_order
from (select id from public.service_templates where template_name = 'Business Consulting' and is_platform_template = true and workspace_id is null) t,
(values
  (1, 'Recent financial statements', 'Financial Statement', 'Please upload your most recent financial statements.', false),
  (2, 'Organizational chart (if applicable)', 'Business Document', 'Please upload an organizational chart, if you have one.', false)
) as x(sort_order, document_name, document_category, client_message, is_required);

-- =====================================================================
-- Business Systems (new template; matches client_setup_options code
-- 'business_systems').
-- =====================================================================
insert into public.service_templates (template_name, service_type, description, default_pipeline_id, is_active, is_platform_template, visibility_scope, workspace_id)
select 'Business Systems', 'business_systems', 'Business systems and workflow project, from assessment through launch.',
  (select id from public.pipelines where pipeline_name = 'Business Systems Pipeline' and is_platform_template = true and workspace_id is null),
  true, true, 'workspace', null
where not exists (select 1 from public.service_templates where template_name = 'Business Systems' and is_platform_template = true and workspace_id is null);

delete from public.service_template_tasks where service_template_id = (select id from public.service_templates where template_name = 'Business Systems' and is_platform_template = true and workspace_id is null);
insert into public.service_template_tasks (service_template_id, task_title, task_description, priority, due_offset_days, sort_order)
select t.id, x.task_title, x.task_description, x.priority, x.due_offset_days, x.sort_order
from (select id from public.service_templates where template_name = 'Business Systems' and is_platform_template = true and workspace_id is null) t,
(values
  (1, 'Complete consultation', 'Confirm scope and answer initial questions with the client.', 'Normal', 0),
  (2, 'Send engagement letter', 'Send engagement terms for client acceptance.', 'Normal', 1),
  (3, 'Perform systems assessment', 'Assess the client''s current systems and needs.', 'Normal', 3),
  (4, 'Review current workflows', 'Review the client''s current workflows and tools.', 'Normal', 6),
  (5, 'Confirm requirements with client', 'Confirm system requirements before design work begins.', 'Normal', 8),
  (6, 'Design system solution', 'Design the new system or workflow.', 'High', 12),
  (7, 'Complete setup', 'Configure and build out the system.', 'High', 16),
  (8, 'Test and confirm functionality', 'Test the system before launch.', 'Normal', 18),
  (9, 'Deliver client training', 'Train the client''s team on the new system.', 'Normal', 20)
) as x(sort_order, task_title, task_description, priority, due_offset_days);

delete from public.service_template_documents where service_template_id = (select id from public.service_templates where template_name = 'Business Systems' and is_platform_template = true and workspace_id is null);
insert into public.service_template_documents (service_template_id, document_name, document_category, client_message, is_required, sort_order)
select t.id, x.document_name, x.document_category, x.client_message, x.is_required, x.sort_order
from (select id from public.service_templates where template_name = 'Business Systems' and is_platform_template = true and workspace_id is null) t,
(values
  (1, 'Current workflow/process documentation (if any)', 'Business Document', 'Please upload any existing documentation of your current workflows.', false)
) as x(sort_order, document_name, document_category, client_message, is_required);

-- =====================================================================
-- Compliance Service (new template; matches client_setup_options code
-- 'compliance').
-- =====================================================================
insert into public.service_templates (template_name, service_type, description, default_pipeline_id, is_active, is_platform_template, visibility_scope, workspace_id)
select 'Compliance Service', 'compliance', 'Standalone compliance filing or support engagement.',
  (select id from public.pipelines where pipeline_name = 'Compliance Service Pipeline' and is_platform_template = true and workspace_id is null),
  true, true, 'workspace', null
where not exists (select 1 from public.service_templates where template_name = 'Compliance Service' and is_platform_template = true and workspace_id is null);

delete from public.service_template_tasks where service_template_id = (select id from public.service_templates where template_name = 'Compliance Service' and is_platform_template = true and workspace_id is null);
insert into public.service_template_tasks (service_template_id, task_title, task_description, priority, due_offset_days, sort_order)
select t.id, x.task_title, x.task_description, x.priority, x.due_offset_days, x.sort_order
from (select id from public.service_templates where template_name = 'Compliance Service' and is_platform_template = true and workspace_id is null) t,
(values
  (1, 'Confirm compliance scope', 'Confirm what filing or compliance matter is being handled.', 'Normal', 0),
  (2, 'Send engagement letter', 'Send engagement terms for client acceptance.', 'Normal', 1),
  (3, 'Request required information', 'Request the information needed to complete the filing.', 'Normal', 2),
  (4, 'Perform compliance review', 'Review received information against compliance requirements.', 'Normal', 6),
  (5, 'Prepare filing', 'Prepare the required filing.', 'High', 9),
  (6, 'Send for client approval', 'Send the completed filing to the client for approval.', 'Normal', 11),
  (7, 'Submit filing', 'Submit the filing to the applicable agency.', 'High', 13),
  (8, 'Confirm receipt/acceptance', 'Confirm the filing was received and accepted.', 'Normal', 16)
) as x(sort_order, task_title, task_description, priority, due_offset_days);

delete from public.service_template_documents where service_template_id = (select id from public.service_templates where template_name = 'Compliance Service' and is_platform_template = true and workspace_id is null);
insert into public.service_template_documents (service_template_id, document_name, document_category, client_message, is_required, sort_order)
select t.id, x.document_name, x.document_category, x.client_message, x.is_required, x.sort_order
from (select id from public.service_templates where template_name = 'Compliance Service' and is_platform_template = true and workspace_id is null) t,
(values
  (1, 'Prior filings or registrations related to this matter', 'Compliance Document', 'Please upload any prior filings or registrations related to this compliance matter.', false)
) as x(sort_order, document_name, document_category, client_message, is_required);
