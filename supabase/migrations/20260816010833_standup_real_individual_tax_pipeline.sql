-- Resolves the long-pending "delete the system pipelines" request: the 6
-- global blueprint processes (workspace_id null, "X pipeline") were never
-- attached to any real engagement or service (verified: 0 engagements,
-- 0 workflow_runs reference them) -- pure unused library templates. The
-- user has said they'll build their other pipelines later, so there's no
-- reason to keep these placeholders around. process_stages cascades on
-- delete.
delete from public.processes where workspace_id is null and name like '% pipeline';

-- MKB Financial Group LLC's own draft "Individual Tax" service + process
-- (auto-copied from the blueprint library on workspace creation) is the
-- one real pipeline this workspace has -- 0 engagements reference it, so
-- promoting it to published and shaping it to match the automations
-- already built this session is safe. Renamed stage 0 from the generic
-- "Intake & Organizer" to "Engagement Letter": intake/organizer now
-- happens before the engagement exists (lead capture + the public
-- organizer flow), so the first thing that happens once the pipeline
-- actually starts is the engagement letter going out.
update public.processes set status = 'published'
where id = '9fffcdfc-5b67-489b-80ed-a434d53b9792';

update public.services set status = 'published'
where id = '2ff9adce-8a62-4c39-acf5-f3e8e9f8ec68';

update public.process_stages set name = 'Engagement Letter'
where id = '3e4154aa-f244-4794-a990-ba55ef0decc5';

-- Real engagement letter, since none existed anywhere in the system --
-- send_engagement_letter had nothing to send.
insert into public.engagement_letter_templates (workspace_id, name, slug, body_html, merge_fields, requires_signature, status)
values (
  '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7',
  'Individual Tax Engagement Letter',
  'individual-tax-engagement-letter',
  '<p>Dear {{client_name}},</p>' ||
  '<p>Thank you for choosing {{firm_name}} to prepare your individual income tax return(s). This letter confirms the terms of our engagement.</p>' ||
  '<p><strong>Services.</strong> We will prepare your federal and applicable state individual income tax return(s) based on information you provide. We will not audit, review, or independently verify the data you supply, but we may ask for clarification of items you provide.</p>' ||
  '<p><strong>Your responsibilities.</strong> You are responsible for the accuracy and completeness of the information you provide, for retaining all documents that support your return (receipts, records, and other data), and for reviewing your return carefully for accuracy before it is filed.</p>' ||
  '<p><strong>Fees.</strong> Fees are based on the complexity of your return and will be provided in a separate quote. Payment is due upon completion of services, prior to e-filing, unless other arrangements have been made.</p>' ||
  '<p><strong>Filing.</strong> Your return will not be filed until you have reviewed and approved it, and it will not be considered complete until you have signed the required e-file authorization.</p>' ||
  '<p>If the above terms are acceptable, please sign below to confirm your agreement and authorize us to begin.</p>' ||
  '<p>Sincerely,<br>{{firm_name}}<br>{{firm_phone}}<br>{{firm_address}}</p>',
  '["client_name", "firm_name", "firm_phone", "firm_address"]'::jsonb,
  true,
  'published'
);

-- Real document request template -- send_document_request had nothing to
-- send either. Only the two universally-needed items are required so the
-- request doesn't get stuck waiting on documents that don't apply to
-- every client (e.g. a self-employed client with no W-2).
insert into public.document_request_templates (workspace_id, name, slug, status)
values ('9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7', 'Individual Tax Documents', 'individual-tax-documents', 'published');

insert into public.document_request_items (document_request_template_id, category, name, is_required, display_order)
select t.id, v.category, v.name, v.is_required, v.display_order
from public.document_request_templates t,
  (values
    ('Identification', 'Government-issued photo ID', true, 0),
    ('Identification', 'Social Security cards or ITIN letters (you, spouse, and dependents)', true, 1),
    ('Prior Year', 'Prior year tax return', false, 2),
    ('Income', 'W-2 forms', false, 3),
    ('Income', '1099 forms (NEC, MISC, INT, DIV, R, K, etc.)', false, 4),
    ('Income', 'Other income documents (K-1, unemployment, Social Security benefits, etc.)', false, 5),
    ('Deductions', 'Mortgage interest statement (Form 1098)', false, 6),
    ('Deductions', 'Property tax statements', false, 7),
    ('Deductions', 'Charitable donation receipts', false, 8),
    ('Health Insurance', 'Form 1095-A, 1095-B, or 1095-C', false, 9),
    ('Banking', 'Voided check or bank letter for direct deposit', false, 10)
  ) as v(category, name, is_required, display_order)
where t.workspace_id = '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7' and t.slug = 'individual-tax-documents';

-- Stage display plumbing (process_stages.*_template_id) -- shown to staff
-- as "this stage's expected template," purely informational; the actual
-- sending is driven by the automations inserted below, not these columns.
update public.process_stages set engagement_letter_template_id = (
  select id from public.engagement_letter_templates where slug = 'individual-tax-engagement-letter' and workspace_id = '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7'
)
where id = '3e4154aa-f244-4794-a990-ba55ef0decc5';

update public.process_stages set document_request_template_id = (
  select id from public.document_request_templates where slug = 'individual-tax-documents' and workspace_id = '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7'
)
where id = '6e286723-576d-4d60-9dd7-f475dbec418c';

update public.process_stages set organizer_template_id = (
  select id from public.organizer_templates where name = 'Form 1040' and workspace_id = '9d3e27c8-e7ed-4db0-a0ce-9b2fa0fe23c7'
)
where id = '3e4154aa-f244-4794-a990-ba55ef0decc5';
