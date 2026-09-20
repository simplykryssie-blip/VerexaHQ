-- QuickBooks Setup & Bookkeeping Consultation intake, for MKB Financial
-- Group LLC (workspace 2896bf43-95db-420f-9bb5-8854f537bbd1).
--
-- Built on the existing organizer/services/pipeline/automation primitives --
-- no new tables, no new automation_steps.action_type branches, no new
-- trigger_type. See the accompanying architecture notes for why the
-- answer-conditional qualification logic (hot/warm/self-service, cleanup,
-- complexity tags, and the two answer-driven internal tasks) lives in a
-- small dedicated trigger function (apply_qb_intake_qualification) rather
-- than the generic automations engine: evaluate_automation_conditions has
-- no way to read an individual organizer answer's value, only a fixed
-- whitelist of client/engagement/quote/task fields plus whatever the
-- trigger's own context jsonb carries (organizer.submitted's context is
-- just {organizer_template_id, status, response_id}). This mirrors already
-- existing template-specific functions such as
-- sync_client_profile_from_public_organizer_submission and
-- _notify_admins_of_organizer_submitted.
--
-- All literal ids below are fixed on purpose (not gen_random_uuid()) so the
-- qualification-tag function can reference specific fields/stages without a
-- separate id-lookup table. Everything is idempotent (on conflict do
-- nothing) so re-running this migration is safe.

-- ============================================================================
-- 1. Service category + three separately-reportable services/products
--    (spec: don't mix consultation / bookkeeping / cleanup revenue)
-- ============================================================================

insert into public.service_categories (id, workspace_id, name, slug, display_order)
values ('a1000000-0000-0000-0000-000000000001', '2896bf43-95db-420f-9bb5-8854f537bbd1', 'QuickBooks & Bookkeeping', 'quickbooks-bookkeeping', 900)
on conflict (id) do nothing;

-- Pipeline created below (section 2); services reference it once created.

-- ============================================================================
-- 2. Pipeline: "QuickBooks & Bookkeeping" (8 stages, lifecycle only --
--    qualification data lives in tags/fields, not stages)
-- ============================================================================

insert into public.processes (id, workspace_id, name, slug, status, is_lead_funnel)
values ('a3000000-0000-0000-0000-000000000001', '2896bf43-95db-420f-9bb5-8854f537bbd1', 'QuickBooks & Bookkeeping', 'quickbooks-bookkeeping', 'published', false)
on conflict (id) do nothing;

insert into public.process_stages (id, process_id, name, display_order) values
('a4000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'Consultation Requested', 0),
('a4000000-0000-0000-0000-000000000002', 'a3000000-0000-0000-0000-000000000001', 'Consultation Scheduled', 1),
('a4000000-0000-0000-0000-000000000003', 'a3000000-0000-0000-0000-000000000001', 'Consultation Completed', 2),
('a4000000-0000-0000-0000-000000000004', 'a3000000-0000-0000-0000-000000000001', 'Bookkeeping Opportunity', 3),
('a4000000-0000-0000-0000-000000000005', 'a3000000-0000-0000-0000-000000000001', 'Proposal Sent', 4),
('a4000000-0000-0000-0000-000000000006', 'a3000000-0000-0000-0000-000000000001', 'Bookkeeping Onboarding', 5),
('a4000000-0000-0000-0000-000000000007', 'a3000000-0000-0000-0000-000000000001', 'Active Bookkeeping', 6),
('a4000000-0000-0000-0000-000000000008', 'a3000000-0000-0000-0000-000000000001', 'Not Pursuing', 7)
on conflict (id) do nothing;

insert into public.services (id, workspace_id, service_category_id, name, slug, description, default_price, process_id, is_bookable, is_portal_visible, status, display_order) values
('a2000000-0000-0000-0000-000000000001', '2896bf43-95db-420f-9bb5-8854f537bbd1', 'a1000000-0000-0000-0000-000000000001',
 'QuickBooks Setup Consultation', 'quickbooks-setup-consultation',
 '90-minute consultation to qualify QuickBooks setup needs and identify bookkeeping opportunities.',
 250, 'a3000000-0000-0000-0000-000000000001', true, true, 'published', 0),
('a2000000-0000-0000-0000-000000000002', '2896bf43-95db-420f-9bb5-8854f537bbd1', 'a1000000-0000-0000-0000-000000000001',
 'Monthly Bookkeeping', 'monthly-bookkeeping',
 'Ongoing monthly bookkeeping -- custom quote, sold after the consultation identifies the need.',
 null, 'a3000000-0000-0000-0000-000000000001', false, false, 'published', 1),
('a2000000-0000-0000-0000-000000000003', '2896bf43-95db-420f-9bb5-8854f537bbd1', 'a1000000-0000-0000-0000-000000000001',
 'QuickBooks Cleanup / Catch-Up', 'quickbooks-cleanup-catchup',
 'One-time cleanup/catch-up of existing books -- custom quote, sold after the consultation identifies the need.',
 null, 'a3000000-0000-0000-0000-000000000001', false, false, 'published', 2)
on conflict (id) do nothing;

-- ============================================================================
-- 3. Public intake form: organizer_templates + organizer_fields
--    (first/last name, email, phone are captured by the built-in Contact
--    step of the public organizer flow -- see PublicOrganizerForm.tsx -- and
--    map straight onto clients.first_name/last_name/primary_email/
--    primary_phone via capture_public_lead_from_contact_step, so they are
--    not duplicated as organizer_fields here.)
-- ============================================================================

insert into public.organizer_templates (id, workspace_id, name, slug, description, status, is_public, requires_portal_signup)
values ('a5000000-0000-0000-0000-000000000001', '2896bf43-95db-420f-9bb5-8854f537bbd1',
 'QuickBooks Setup & Bookkeeping Consultation', 'quickbooks_bookkeeping_consultation',
 'Public intake / lead qualification for the $250, 90-minute QuickBooks setup & bookkeeping consultation.',
 'published', true, false)
on conflict (id) do nothing;

-- Section: Contact Information (business-specific fields only; personal
-- contact fields come from the Contact step)
insert into public.organizer_fields (id, organizer_template_id, field_type, label, display_order, is_required, options, conditional_logic, client_profile_field) values
('a6000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'page_break', 'Contact Information', 1, false, '[]', '{}', null),
('a6000000-0000-0000-0000-000000000002', 'a5000000-0000-0000-0000-000000000001', 'short_text', 'Business Name', 2, true, '[]', '{}', 'business_name'),
('a6000000-0000-0000-0000-000000000003', 'a5000000-0000-0000-0000-000000000001', 'website', 'Business Website', 3, false, '[]', '{}', null),
('a6000000-0000-0000-0000-000000000004', 'a5000000-0000-0000-0000-000000000001', 'address', 'Business Address', 4, true, '[]', '{}', 'mailing_address')
on conflict (id) do nothing;

-- Section: Business Profile
insert into public.organizer_fields (id, organizer_template_id, field_type, label, display_order, is_required, options, conditional_logic) values
('a6000000-0000-0000-0000-000000000005', 'a5000000-0000-0000-0000-000000000001', 'page_break', 'Business Profile', 5, false, '[]', '{}'),
('a6000000-0000-0000-0000-000000000006', 'a5000000-0000-0000-0000-000000000001', 'dropdown', 'What type of business entity is the practice?', 6, true,
  jsonb_build_array(
    jsonb_build_object('label','Sole Proprietorship','value','sole_proprietorship'),
    jsonb_build_object('label','Single-Member LLC','value','single_member_llc'),
    jsonb_build_object('label','Multi-Member LLC','value','multi_member_llc'),
    jsonb_build_object('label','S Corporation','value','s_corporation'),
    jsonb_build_object('label','C Corporation','value','c_corporation'),
    jsonb_build_object('label','Partnership','value','partnership'),
    jsonb_build_object('label','Other','value','other'),
    jsonb_build_object('label','Not Sure','value','not_sure')
  ), '{}'),
('a6000000-0000-0000-0000-000000000007', 'a5000000-0000-0000-0000-000000000001', 'short_text', 'Please specify the business entity.', 7, true, '[]',
  jsonb_build_object('show_if', jsonb_build_object('match','all','conditions', jsonb_build_array(
    jsonb_build_object('field_id','a6000000-0000-0000-0000-000000000006','operator','equals','value','other'))))),
('a6000000-0000-0000-0000-000000000008', 'a5000000-0000-0000-0000-000000000001', 'date', 'When was the business legally established?', 8, true, '[]', '{}'),
('a6000000-0000-0000-0000-000000000009', 'a5000000-0000-0000-0000-000000000001', 'date', 'When do you expect the practice to begin operating?', 9, true, '[]', '{}'),
('a600000a-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'yes_no', 'Has the business already generated revenue?', 10, true, '[]', '{}'),
('a600000b-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'currency', 'Approximately how much revenue has the business generated so far?', 11, true, '[]',
  jsonb_build_object('show_if', jsonb_build_object('match','all','conditions', jsonb_build_array(
    jsonb_build_object('field_id','a600000a-0000-0000-0000-000000000000','operator','equals','value','yes')))))
on conflict (id) do nothing;

-- Section: Services & Revenue
insert into public.organizer_fields (id, organizer_template_id, field_type, label, display_order, is_required, options, conditional_logic) values
('a600000c-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'page_break', 'Services & Revenue', 12, false, '[]', '{}'),
('a600000d-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'checkbox', 'What services will the practice provide?', 13, true,
  jsonb_build_array(
    jsonb_build_object('label','Therapy/Counseling','value','therapy_counseling'),
    jsonb_build_object('label','Psychological Evaluations','value','psychological_evaluations'),
    jsonb_build_object('label','Assessments','value','assessments'),
    jsonb_build_object('label','Consultation','value','consultation'),
    jsonb_build_object('label','Telehealth','value','telehealth'),
    jsonb_build_object('label','Coaching','value','coaching'),
    jsonb_build_object('label','Workshops/Training','value','workshops_training'),
    jsonb_build_object('label','Other','value','other')
  ), '{}'),
('a600000e-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'short_text', 'Please specify the other service(s).', 14, true, '[]',
  jsonb_build_object('show_if', jsonb_build_object('match','all','conditions', jsonb_build_array(
    jsonb_build_object('field_id','a600000d-0000-0000-0000-000000000000','operator','includes','value','other'))))),
('a600000f-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'radio_button', 'Will the practice accept insurance?', 15, true,
  jsonb_build_array(jsonb_build_object('label','Yes','value','yes'), jsonb_build_object('label','No','value','no'), jsonb_build_object('label','Not Sure','value','not_sure')), '{}'),
('a6000010-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'checkbox', 'How will the practice primarily receive payments?', 16, true,
  jsonb_build_array(
    jsonb_build_object('label','Insurance reimbursements','value','insurance_reimbursements'),
    jsonb_build_object('label','Credit/Debit Cards','value','credit_debit_cards'),
    jsonb_build_object('label','ACH','value','ach'),
    jsonb_build_object('label','Cash','value','cash'),
    jsonb_build_object('label','Checks','value','checks'),
    jsonb_build_object('label','Payment Processor','value','payment_processor'),
    jsonb_build_object('label','EHR/Practice Management System','value','ehr_pms'),
    jsonb_build_object('label','Other','value','other')
  ), '{}'),
('a6000011-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'short_text', 'Which payment processor do you use or plan to use?', 17, true, '[]',
  jsonb_build_object('show_if', jsonb_build_object('match','all','conditions', jsonb_build_array(
    jsonb_build_object('field_id','a6000010-0000-0000-0000-000000000000','operator','includes','value','payment_processor')))))
on conflict (id) do nothing;

-- Section: EHR / Practice Management
insert into public.organizer_fields (id, organizer_template_id, field_type, label, display_order, is_required, options, conditional_logic) values
('a6000012-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'page_break', 'EHR / Practice Management', 18, false, '[]', '{}'),
('a6000013-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'radio_button', 'Do you use an EHR or practice-management system?', 19, true,
  jsonb_build_array(jsonb_build_object('label','Yes','value','yes'), jsonb_build_object('label','No','value','no'), jsonb_build_object('label','Not Sure','value','not_sure')), '{}'),
('a6000014-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'short_text', 'Which EHR/practice-management system do you use?', 20, true, '[]',
  jsonb_build_object('show_if', jsonb_build_object('match','all','conditions', jsonb_build_array(
    jsonb_build_object('field_id','a6000013-0000-0000-0000-000000000000','operator','equals','value','yes'))))),
('a6000015-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'radio_button', 'Does your EHR handle billing or payment processing?', 21, true,
  jsonb_build_array(jsonb_build_object('label','Yes','value','yes'), jsonb_build_object('label','No','value','no'), jsonb_build_object('label','Not Sure','value','not_sure')),
  jsonb_build_object('show_if', jsonb_build_object('match','all','conditions', jsonb_build_array(
    jsonb_build_object('field_id','a6000013-0000-0000-0000-000000000000','operator','equals','value','yes')))))
on conflict (id) do nothing;

-- Section: QuickBooks Status
insert into public.organizer_fields (id, organizer_template_id, field_type, label, display_order, is_required, options, conditional_logic) values
('a6000016-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'page_break', 'QuickBooks Status', 22, false, '[]', '{}'),
('a6000017-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'radio_button', 'Do you already have QuickBooks Online?', 23, true,
  jsonb_build_array(jsonb_build_object('label','Yes','value','yes'), jsonb_build_object('label','No','value','no'), jsonb_build_object('label','I''m Not Sure','value','not_sure')), '{}'),
('a6000018-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'dropdown', 'Which QuickBooks Online plan are you using?', 24, false,
  jsonb_build_array(
    jsonb_build_object('label','Simple Start','value','simple_start'),
    jsonb_build_object('label','Essentials','value','essentials'),
    jsonb_build_object('label','Plus','value','plus'),
    jsonb_build_object('label','Advanced','value','advanced'),
    jsonb_build_object('label','I''m Not Sure','value','not_sure')
  ),
  jsonb_build_object('show_if', jsonb_build_object('match','all','conditions', jsonb_build_array(
    jsonb_build_object('field_id','a6000017-0000-0000-0000-000000000000','operator','equals','value','yes'))))),
('a6000019-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'date', 'When was the QuickBooks account created?', 25, false, '[]',
  jsonb_build_object('show_if', jsonb_build_object('match','all','conditions', jsonb_build_array(
    jsonb_build_object('field_id','a6000017-0000-0000-0000-000000000000','operator','equals','value','yes'))))),
('a600001a-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'radio_button', 'Have you entered transactions into QuickBooks?', 26, false,
  jsonb_build_array(jsonb_build_object('label','Yes','value','yes'), jsonb_build_object('label','No','value','no'), jsonb_build_object('label','I''m Not Sure','value','not_sure')),
  jsonb_build_object('show_if', jsonb_build_object('match','all','conditions', jsonb_build_array(
    jsonb_build_object('field_id','a6000017-0000-0000-0000-000000000000','operator','equals','value','yes'))))),
('a600001b-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'radio_button', 'Have you connected your bank accounts to QuickBooks?', 27, false,
  jsonb_build_array(jsonb_build_object('label','Yes','value','yes'), jsonb_build_object('label','No','value','no'), jsonb_build_object('label','I''m Not Sure','value','not_sure')),
  jsonb_build_object('show_if', jsonb_build_object('match','all','conditions', jsonb_build_array(
    jsonb_build_object('field_id','a6000017-0000-0000-0000-000000000000','operator','equals','value','yes'))))),
('a600001c-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'radio_button', 'Have you connected your business credit cards?', 28, false,
  jsonb_build_array(jsonb_build_object('label','Yes','value','yes'), jsonb_build_object('label','No','value','no'), jsonb_build_object('label','Not Applicable','value','not_applicable'), jsonb_build_object('label','I''m Not Sure','value','not_sure')),
  jsonb_build_object('show_if', jsonb_build_object('match','all','conditions', jsonb_build_array(
    jsonb_build_object('field_id','a6000017-0000-0000-0000-000000000000','operator','equals','value','yes')))))
on conflict (id) do nothing;

-- Section: Business Banking
insert into public.organizer_fields (id, organizer_template_id, field_type, label, display_order, is_required, options, conditional_logic) values
('a600001d-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'page_break', 'Business Banking', 29, false, '[]', '{}'),
('a600001e-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'radio_button', 'Does the business have a dedicated business checking account?', 30, true,
  jsonb_build_array(jsonb_build_object('label','Yes','value','yes'), jsonb_build_object('label','No','value','no'), jsonb_build_object('label','In Process','value','in_process')), '{}'),
('a600001f-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'yes_no', 'Does the business have a business savings account?', 31, true, '[]', '{}'),
('a6000020-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'yes_no', 'Does the business have a business credit card?', 32, true, '[]', '{}'),
('a6000021-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'yes_no', 'Does the business have any business loans or financing?', 33, true, '[]', '{}'),
('a6000022-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'radio_button', 'Are business and personal transactions completely separated?', 34, true,
  jsonb_build_array(jsonb_build_object('label','Yes','value','yes'), jsonb_build_object('label','No','value','no'), jsonb_build_object('label','Mostly','value','mostly'), jsonb_build_object('label','I''m Not Sure','value','not_sure')), '{}'),
('a6000023-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'paragraph', 'Briefly explain how business and personal expenses are currently being handled.', 35, false, '[]',
  jsonb_build_object('show_if', jsonb_build_object('match','any','conditions', jsonb_build_array(
    jsonb_build_object('field_id','a6000022-0000-0000-0000-000000000000','operator','equals','value','no'),
    jsonb_build_object('field_id','a6000022-0000-0000-0000-000000000000','operator','equals','value','mostly'),
    jsonb_build_object('field_id','a6000022-0000-0000-0000-000000000000','operator','equals','value','not_sure')))))
on conflict (id) do nothing;

-- Section: Current Bookkeeping
insert into public.organizer_fields (id, organizer_template_id, field_type, label, display_order, is_required, options, conditional_logic) values
('a6000024-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'page_break', 'Current Bookkeeping', 36, false, '[]', '{}'),
('a6000025-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'dropdown', 'Who currently handles your bookkeeping?', 37, true,
  jsonb_build_array(
    jsonb_build_object('label','I do it myself','value','i_do_it_myself'),
    jsonb_build_object('label','Business owner/partner','value','business_owner_partner'),
    jsonb_build_object('label','Employee','value','employee'),
    jsonb_build_object('label','Bookkeeper','value','bookkeeper'),
    jsonb_build_object('label','CPA/Accountant','value','cpa_accountant'),
    jsonb_build_object('label','No one currently','value','no_one_currently'),
    jsonb_build_object('label','Other','value','other')
  ), '{}'),
('a6000026-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'dropdown', 'How often are your books currently updated?', 38, true,
  jsonb_build_array(
    jsonb_build_object('label','Daily','value','daily'),
    jsonb_build_object('label','Weekly','value','weekly'),
    jsonb_build_object('label','Monthly','value','monthly'),
    jsonb_build_object('label','Quarterly','value','quarterly'),
    jsonb_build_object('label','Occasionally','value','occasionally'),
    jsonb_build_object('label','Not currently maintained','value','not_currently_maintained'),
    jsonb_build_object('label','I''m Not Sure','value','not_sure')
  ), '{}'),
('a6000027-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'dropdown', 'When were your books last reconciled?', 39, true,
  jsonb_build_array(
    jsonb_build_object('label','This month','value','this_month'),
    jsonb_build_object('label','1-3 months ago','value','1_3_months_ago'),
    jsonb_build_object('label','3-6 months ago','value','3_6_months_ago'),
    jsonb_build_object('label','More than 6 months ago','value','more_than_6_months_ago'),
    jsonb_build_object('label','Never','value','never'),
    jsonb_build_object('label','I''m Not Sure','value','not_sure')
  ), '{}'),
('a6000028-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'dropdown', 'Approximately how many transactions does the business have per month?', 40, true,
  jsonb_build_array(
    jsonb_build_object('label','0-25','value','0_25'),
    jsonb_build_object('label','26-50','value','26_50'),
    jsonb_build_object('label','51-100','value','51_100'),
    jsonb_build_object('label','101-250','value','101_250'),
    jsonb_build_object('label','251-500','value','251_500'),
    jsonb_build_object('label','500+','value','500_plus'),
    jsonb_build_object('label','I''m Not Sure','value','not_sure')
  ), '{}'),
('a6000029-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'radio_button', 'Do your books need to be caught up or cleaned up?', 41, true,
  jsonb_build_array(jsonb_build_object('label','Yes','value','yes'), jsonb_build_object('label','No','value','no'), jsonb_build_object('label','I''m Not Sure','value','not_sure')), '{}'),
('a600002a-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'dropdown', 'Approximately how many months need to be reviewed?', 42, true,
  jsonb_build_array(
    jsonb_build_object('label','Less than 1 month','value','less_than_1_month'),
    jsonb_build_object('label','1-3 months','value','1_3_months'),
    jsonb_build_object('label','3-6 months','value','3_6_months'),
    jsonb_build_object('label','6-12 months','value','6_12_months'),
    jsonb_build_object('label','More than 12 months','value','more_than_12_months'),
    jsonb_build_object('label','I''m Not Sure','value','not_sure')
  ),
  jsonb_build_object('show_if', jsonb_build_object('match','all','conditions', jsonb_build_array(
    jsonb_build_object('field_id','a6000029-0000-0000-0000-000000000000','operator','equals','value','yes'))))),
('a600002b-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'dropdown', 'Approximately how many transactions need review?', 43, true,
  jsonb_build_array(
    jsonb_build_object('label','Under 100','value','under_100'),
    jsonb_build_object('label','100-500','value','100_500'),
    jsonb_build_object('label','500-1,000','value','500_1000'),
    jsonb_build_object('label','1,000+','value','1000_plus'),
    jsonb_build_object('label','I''m Not Sure','value','not_sure')
  ),
  jsonb_build_object('show_if', jsonb_build_object('match','all','conditions', jsonb_build_array(
    jsonb_build_object('field_id','a6000029-0000-0000-0000-000000000000','operator','equals','value','yes')))))
on conflict (id) do nothing;

-- Section: Bookkeeping Service Interest
insert into public.organizer_fields (id, organizer_template_id, field_type, label, display_order, is_required, options, conditional_logic) values
('a600002c-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'page_break', 'Bookkeeping Service Interest', 44, false, '[]', '{}'),
('a600002d-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'radio_button', 'How would you prefer to handle your bookkeeping going forward?', 45, true,
  jsonb_build_array(
    jsonb_build_object('label','I''ll do it myself','value','self_manage'),
    jsonb_build_object('label','I want guidance','value','guidance'),
    jsonb_build_object('label','I''d rather have someone handle it','value','professional_manage'),
    jsonb_build_object('label','I''m not sure yet','value','not_sure')
  ), '{}'),
('a600002e-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'checkbox', 'What type of support would be helpful?', 46, true,
  jsonb_build_array(
    jsonb_build_object('label','QuickBooks setup','value','quickbooks_setup'),
    jsonb_build_object('label','QuickBooks training','value','quickbooks_training'),
    jsonb_build_object('label','Chart of Accounts setup','value','chart_of_accounts_setup'),
    jsonb_build_object('label','Bank reconciliation','value','bank_reconciliation'),
    jsonb_build_object('label','Transaction categorization','value','transaction_categorization'),
    jsonb_build_object('label','Monthly bookkeeping','value','monthly_bookkeeping'),
    jsonb_build_object('label','Catch-up bookkeeping','value','catch_up_bookkeeping'),
    jsonb_build_object('label','Bookkeeping cleanup','value','bookkeeping_cleanup'),
    jsonb_build_object('label','Financial reports','value','financial_reports'),
    jsonb_build_object('label','Accounts receivable','value','accounts_receivable'),
    jsonb_build_object('label','Accounts payable','value','accounts_payable'),
    jsonb_build_object('label','Ongoing QuickBooks support','value','ongoing_quickbooks_support'),
    jsonb_build_object('label','Not sure','value','not_sure')
  ), '{}'),
('a600002f-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'dropdown', 'What''s your biggest bookkeeping challenge right now?', 47, true,
  jsonb_build_array(
    jsonb_build_object('label','I don''t know how to use QuickBooks','value','dont_know_quickbooks'),
    jsonb_build_object('label','I don''t know how to categorize transactions','value','dont_know_categorize'),
    jsonb_build_object('label','My books are behind','value','books_behind'),
    jsonb_build_object('label','My books are messy','value','books_messy'),
    jsonb_build_object('label','I don''t have time','value','no_time'),
    jsonb_build_object('label','I don''t understand my financial reports','value','dont_understand_reports'),
    jsonb_build_object('label','I don''t know if my books are accurate','value','dont_know_if_accurate'),
    jsonb_build_object('label','I haven''t started bookkeeping','value','havent_started'),
    jsonb_build_object('label','I want someone else to handle it','value','want_someone_else_to_handle_it'),
    jsonb_build_object('label','Other','value','other')
  ), '{}'),
('a6000030-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'paragraph', 'Please describe your biggest bookkeeping challenge.', 48, true, '[]',
  jsonb_build_object('show_if', jsonb_build_object('match','all','conditions', jsonb_build_array(
    jsonb_build_object('field_id','a600002f-0000-0000-0000-000000000000','operator','equals','value','other'))))),
('a6000031-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'paragraph', 'What would you ideally like to stop doing yourself?', 49, false, '[]', '{}')
on conflict (id) do nothing;

-- Section: Employees & Contractors
insert into public.organizer_fields (id, organizer_template_id, field_type, label, display_order, is_required, options, conditional_logic) values
('a6000032-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'page_break', 'Employees & Contractors', 50, false, '[]', '{}'),
('a6000033-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'radio_button', 'Will the practice have employees?', 51, true,
  jsonb_build_array(jsonb_build_object('label','Yes','value','yes'), jsonb_build_object('label','No','value','no'), jsonb_build_object('label','Not Sure','value','not_sure')), '{}'),
('a6000034-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'number', 'How many employees?', 52, true, '[]',
  jsonb_build_object('show_if', jsonb_build_object('match','all','conditions', jsonb_build_array(
    jsonb_build_object('field_id','a6000033-0000-0000-0000-000000000000','operator','equals','value','yes'))))),
('a6000035-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'radio_button', 'Will the practice use independent contractors?', 53, true,
  jsonb_build_array(jsonb_build_object('label','Yes','value','yes'), jsonb_build_object('label','No','value','no'), jsonb_build_object('label','Not Sure','value','not_sure')), '{}'),
('a6000036-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'number', 'How many independent contractors?', 54, true, '[]',
  jsonb_build_object('show_if', jsonb_build_object('match','all','conditions', jsonb_build_array(
    jsonb_build_object('field_id','a6000035-0000-0000-0000-000000000000','operator','equals','value','yes'))))),
('a6000037-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'radio_button', 'Will you pay other therapists, clinicians, or healthcare professionals?', 55, true,
  jsonb_build_array(jsonb_build_object('label','Yes','value','yes'), jsonb_build_object('label','No','value','no'), jsonb_build_object('label','Not Sure','value','not_sure')), '{}')
on conflict (id) do nothing;

-- Section: Expense Profile
insert into public.organizer_fields (id, organizer_template_id, field_type, label, display_order, is_required, options, conditional_logic) values
('a6000038-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'page_break', 'Expense Profile', 56, false, '[]', '{}'),
('a6000039-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'checkbox', 'Which types of expenses do you expect?', 57, true,
  jsonb_build_array(
    jsonb_build_object('label','Rent','value','rent'), jsonb_build_object('label','Utilities','value','utilities'),
    jsonb_build_object('label','Internet','value','internet'), jsonb_build_object('label','Telephone','value','telephone'),
    jsonb_build_object('label','Office Supplies','value','office_supplies'), jsonb_build_object('label','Furniture','value','furniture'),
    jsonb_build_object('label','Equipment','value','equipment'), jsonb_build_object('label','Software','value','software'),
    jsonb_build_object('label','EHR','value','ehr'), jsonb_build_object('label','Telehealth','value','telehealth'),
    jsonb_build_object('label','Marketing','value','marketing'), jsonb_build_object('label','Website','value','website'),
    jsonb_build_object('label','Insurance','value','insurance'), jsonb_build_object('label','Licensing','value','licensing'),
    jsonb_build_object('label','Continuing Education','value','continuing_education'), jsonb_build_object('label','Professional Memberships','value','professional_memberships'),
    jsonb_build_object('label','Legal','value','legal'), jsonb_build_object('label','Accounting/Tax','value','accounting_tax'),
    jsonb_build_object('label','Payroll','value','payroll'), jsonb_build_object('label','Contractors','value','contractors'),
    jsonb_build_object('label','Merchant Fees','value','merchant_fees'), jsonb_build_object('label','Other','value','other')
  ), '{}'),
('a600003a-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'radio_button', 'Do you expect significant equipment, furniture, or other startup purchases?', 58, true,
  jsonb_build_array(jsonb_build_object('label','Yes','value','yes'), jsonb_build_object('label','No','value','no'), jsonb_build_object('label','Not Sure','value','not_sure')), '{}')
on conflict (id) do nothing;

-- Section: Accountant
insert into public.organizer_fields (id, organizer_template_id, field_type, label, display_order, is_required, options, conditional_logic) values
('a600003b-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'page_break', 'Accountant', 59, false, '[]', '{}'),
('a600003c-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'yes_no', 'Do you currently have a CPA, accountant, or tax preparer?', 60, true, '[]', '{}'),
('a600003d-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'yes_no', 'Will someone else prepare your business tax return?', 61, true, '[]', '{}'),
('a600003e-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'yes_no', 'Do you want your accountant/tax professional to have QuickBooks access?', 62, false, '[]', '{}')
on conflict (id) do nothing;

-- Section: Consultation Goals
insert into public.organizer_fields (id, organizer_template_id, field_type, label, display_order, is_required, options, conditional_logic) values
('a600003f-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'page_break', 'Consultation Goals', 63, false, '[]', '{}'),
('a6000040-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'checkbox', 'What would you like to accomplish during your consultation?', 64, true,
  jsonb_build_array(
    jsonb_build_object('label','Set up QuickBooks','value','set_up_quickbooks'),
    jsonb_build_object('label','Review QuickBooks settings','value','review_quickbooks_settings'),
    jsonb_build_object('label','Build Chart of Accounts','value','build_chart_of_accounts'),
    jsonb_build_object('label','Connect bank accounts','value','connect_bank_accounts'),
    jsonb_build_object('label','Connect credit cards','value','connect_credit_cards'),
    jsonb_build_object('label','Set up services','value','set_up_services'),
    jsonb_build_object('label','Set up income categories','value','set_up_income_categories'),
    jsonb_build_object('label','Set up expense categories','value','set_up_expense_categories'),
    jsonb_build_object('label','Learn transaction categorization','value','learn_transaction_categorization'),
    jsonb_build_object('label','Learn bank reconciliation','value','learn_bank_reconciliation'),
    jsonb_build_object('label','Review financial reports','value','review_financial_reports'),
    jsonb_build_object('label','Review existing books','value','review_existing_books'),
    jsonb_build_object('label','Discuss bookkeeping cleanup','value','discuss_bookkeeping_cleanup'),
    jsonb_build_object('label','Discuss ongoing bookkeeping','value','discuss_ongoing_bookkeeping'),
    jsonb_build_object('label','Create bookkeeping workflow','value','create_bookkeeping_workflow'),
    jsonb_build_object('label','Prepare for accountant/tax professional','value','prepare_for_accountant'),
    jsonb_build_object('label','Other','value','other')
  ), '{}'),
('a6000041-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'paragraph', 'Top question 1', 65, true, '[]', '{}'),
('a6000042-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'paragraph', 'Top question 2', 66, false, '[]', '{}'),
('a6000043-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'paragraph', 'Top question 3', 67, false, '[]', '{}')
on conflict (id) do nothing;

-- Section: Bookkeeping Opportunity
insert into public.organizer_fields (id, organizer_template_id, field_type, label, display_order, is_required, options, conditional_logic) values
('a6000044-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'page_break', 'Bookkeeping Opportunity', 68, false, '[]', '{}'),
('a6000045-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'radio_button', 'Would you like information about ongoing bookkeeping services?', 69, true,
  jsonb_build_array(
    jsonb_build_object('label','Yes -- I''m interested','value','yes'),
    jsonb_build_object('label','Maybe -- I''d like to learn more','value','maybe'),
    jsonb_build_object('label','No -- I''ll handle it myself','value','no')
  ), '{}'),
('a6000046-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'checkbox', 'What type of bookkeeping support would interest you?', 70, true,
  jsonb_build_array(
    jsonb_build_object('label','Monthly bookkeeping','value','monthly_bookkeeping'),
    jsonb_build_object('label','Monthly reconciliation','value','monthly_reconciliation'),
    jsonb_build_object('label','Transaction categorization','value','transaction_categorization'),
    jsonb_build_object('label','Financial statement preparation','value','financial_statement_preparation'),
    jsonb_build_object('label','Catch-up bookkeeping','value','catch_up_bookkeeping'),
    jsonb_build_object('label','Bookkeeping cleanup','value','bookkeeping_cleanup'),
    jsonb_build_object('label','Quarterly bookkeeping review','value','quarterly_bookkeeping_review'),
    jsonb_build_object('label','Ongoing QuickBooks support','value','ongoing_quickbooks_support'),
    jsonb_build_object('label','Not sure -- recommend what I need','value','not_sure')
  ),
  jsonb_build_object('show_if', jsonb_build_object('match','any','conditions', jsonb_build_array(
    jsonb_build_object('field_id','a6000045-0000-0000-0000-000000000000','operator','equals','value','yes'),
    jsonb_build_object('field_id','a6000045-0000-0000-0000-000000000000','operator','equals','value','maybe'))))),
('a6000047-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'radio_button', 'How involved would you like to be in your bookkeeping?', 71, true,
  jsonb_build_array(
    jsonb_build_object('label','I want everything handled for me','value','fully_handled'),
    jsonb_build_object('label','I want someone to handle most of it','value','mostly_handled'),
    jsonb_build_object('label','I want someone to review what I do','value','review_only'),
    jsonb_build_object('label','I want to learn and do it myself','value','learn_and_self_manage'),
    jsonb_build_object('label','I''m not sure','value','not_sure')
  ),
  jsonb_build_object('show_if', jsonb_build_object('match','any','conditions', jsonb_build_array(
    jsonb_build_object('field_id','a6000045-0000-0000-0000-000000000000','operator','equals','value','yes'),
    jsonb_build_object('field_id','a6000045-0000-0000-0000-000000000000','operator','equals','value','maybe')))))
on conflict (id) do nothing;

-- Section: Final Acknowledgment
insert into public.organizer_fields (id, organizer_template_id, field_type, label, display_order, is_required, options, conditional_logic, is_internal_only) values
('a6000048-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'page_break', 'Final Acknowledgment', 72, false, '[]', '{}', false),
('a6000049-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'checkbox',
  'I understand that this consultation provides QuickBooks setup guidance, software education, and bookkeeping workflow guidance. Tax, legal, and specialized accounting questions may need to be addressed by my CPA, accountant, tax professional, or other qualified professional.',
  73, true, jsonb_build_array(jsonb_build_object('label','I understand and agree','value','acknowledged')), '{}', false),
('a600004a-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'checkbox',
  'I understand that I should not submit passwords, bank login credentials, Social Security numbers, patient/client information, diagnoses, treatment information, insurance IDs, or other sensitive information through this form.',
  74, true, jsonb_build_array(jsonb_build_object('label','I understand and agree','value','acknowledged')), '{}', false),
-- Staff-only field, filled out after the consultation happens -- not shown on the public form.
('a600004b-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000001', 'radio_button', 'Consultation Outcome', 75, false,
  jsonb_build_array(
    jsonb_build_object('label','Setup Only','value','setup_only'),
    jsonb_build_object('label','Setup + Training','value','setup_and_training'),
    jsonb_build_object('label','Cleanup Needed','value','cleanup_needed'),
    jsonb_build_object('label','Monthly Bookkeeping Opportunity','value','monthly_bookkeeping_opportunity'),
    jsonb_build_object('label','Cleanup + Monthly Bookkeeping','value','cleanup_and_monthly_bookkeeping'),
    jsonb_build_object('label','No Additional Service','value','no_additional_service'),
    jsonb_build_object('label','Follow-Up Required','value','follow_up_required')
  ), '{}', true)
on conflict (id) do nothing;

-- ============================================================================
-- 4. Tag registry (workspace_tags is an autocomplete list; the actual
--    tag-on-client relationship is clients.tags text[], mutated by the
--    add_tag automation action / the qualification trigger below)
-- ============================================================================

insert into public.workspace_tags (workspace_id, name)
select '2896bf43-95db-420f-9bb5-8854f537bbd1', t.name
from (values
  ('QB-CONSULT'), ('QB-INTAKE-SUBMITTED'), ('QB-NEW-SETUP'), ('QB-EXISTING'),
  ('BOOKKEEPING-HOT'), ('BOOKKEEPING-WARM'), ('BOOKKEEPING-SELF'),
  ('QB-CLEANUP'), ('QB-CATCHUP'), ('QB-COMPLEX'), ('QB-STANDARD')
) as t(name)
where not exists (
  select 1 from public.workspace_tags wt
  where wt.workspace_id = '2896bf43-95db-420f-9bb5-8854f537bbd1' and wt.name = t.name
);

-- ============================================================================
-- 5. Qualification tag engine + answer-driven internal tasks
--
--    Fires on every submission of this one template. Reads the answers by
--    the fixed field ids assigned above (no generic condition primitive can
--    inspect an individual organizer answer's value -- see header note), and:
--      - mirrors the qualifying answers onto clients.custom_fields->'quickbooks_intake'
--        (the "custom contact fields" the spec asks for -- this schema has
--        no dynamic field-definition table, so the custom_fields jsonb bag
--        is the existing convention for this)
--      - applies every tag from the TAG ENGINE section of the spec
--      - creates the two answer-conditional internal tasks (hot bookkeeping
--        discussion prep, cleanup scope review) that the generic engine
--        can't gate on an answer value
--
--    Does NOT touch pipeline stage, assignment, or the confirmation email --
--    those are unconditional and stay in the "QuickBooks Intake Received"
--    automation below, where staff can see/toggle them normally.
-- ============================================================================

create or replace function public.apply_qb_intake_qualification()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_template_id constant uuid := 'a5000000-0000-0000-0000-000000000001';
  v_answers jsonb;
  v_tags text[] := '{}';
  v_is_hot boolean := false;
  v_is_warm boolean := false;
  v_is_self boolean := false;
  v_is_cleanup boolean := false;
  v_is_catchup boolean := false;
  v_is_complex boolean := false;
  v_employee_count numeric;
  v_contractor_count numeric;
begin
  if NEW.organizer_template_id is distinct from v_template_id or NEW.status is distinct from 'submitted' then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and OLD.status = 'submitted' then
    return NEW; -- only run once, on the transition into submitted
  end if;
  if NEW.client_id is null then
    return NEW;
  end if;

  select jsonb_object_agg(ofld.id::text, a.value) into v_answers
  from public.organizer_response_answers a
  join public.organizer_fields ofld on ofld.id = a.organizer_field_id
  where a.organizer_response_id = NEW.id and a.instance_index = 0;

  v_answers := coalesce(v_answers, '{}'::jsonb);

  -- Mirror the qualifying answers onto the client's custom fields, keyed the
  -- same way the build spec names them.
  update public.clients set custom_fields = custom_fields || jsonb_build_object('quickbooks_intake', jsonb_build_object(
    'business_entity', v_answers->>'a6000006-0000-0000-0000-000000000000',
    'business_start_date', v_answers->>'a6000008-0000-0000-0000-000000000000',
    'practice_open_date', v_answers->>'a6000009-0000-0000-0000-000000000000',
    'practice_services', v_answers->>'a600000d-0000-0000-0000-000000000000',
    'accepts_insurance', v_answers->>'a600000f-0000-0000-0000-000000000000',
    'payment_methods', v_answers->>'a6000010-0000-0000-0000-000000000000',
    'uses_ehr', v_answers->>'a6000013-0000-0000-0000-000000000000',
    'ehr_system', v_answers->>'a6000014-0000-0000-0000-000000000000',
    'ehr_handles_billing', v_answers->>'a6000015-0000-0000-0000-000000000000',
    'has_quickbooks', v_answers->>'a6000017-0000-0000-0000-000000000000',
    'quickbooks_plan', v_answers->>'a6000018-0000-0000-0000-000000000000',
    'qbo_transactions_entered', v_answers->>'a600001a-0000-0000-0000-000000000000',
    'qbo_bank_connected', v_answers->>'a600001b-0000-0000-0000-000000000000',
    'qbo_credit_cards_connected', v_answers->>'a600001c-0000-0000-0000-000000000000',
    'business_checking', v_answers->>'a600001e-0000-0000-0000-000000000000',
    'business_savings', v_answers->>'a600001f-0000-0000-0000-000000000000',
    'business_credit_card', v_answers->>'a6000020-0000-0000-0000-000000000000',
    'business_loans', v_answers->>'a6000021-0000-0000-0000-000000000000',
    'personal_business_separation', v_answers->>'a6000022-0000-0000-0000-000000000000',
    'bookkeeping_current_owner', v_answers->>'a6000025-0000-0000-0000-000000000000',
    'bookkeeping_frequency', v_answers->>'a6000026-0000-0000-0000-000000000000',
    'last_reconciliation', v_answers->>'a6000027-0000-0000-0000-000000000000',
    'monthly_transaction_volume', v_answers->>'a6000028-0000-0000-0000-000000000000',
    'books_need_cleanup', v_answers->>'a6000029-0000-0000-0000-000000000000',
    'cleanup_months', v_answers->>'a600002a-0000-0000-0000-000000000000',
    'cleanup_transaction_volume', v_answers->>'a600002b-0000-0000-0000-000000000000',
    'has_employees', v_answers->>'a6000033-0000-0000-0000-000000000000',
    'employee_count', v_answers->>'a6000034-0000-0000-0000-000000000000',
    'uses_contractors', v_answers->>'a6000035-0000-0000-0000-000000000000',
    'contractor_count', v_answers->>'a6000036-0000-0000-0000-000000000000',
    'pays_clinicians', v_answers->>'a6000037-0000-0000-0000-000000000000',
    'wants_bookkeeping_information', v_answers->>'a6000045-0000-0000-0000-000000000000',
    'bookkeeping_preference', v_answers->>'a600002d-0000-0000-0000-000000000000',
    'bookkeeping_services_interest', v_answers->>'a600002e-0000-0000-0000-000000000000',
    'bookkeeping_pain_point', v_answers->>'a600002f-0000-0000-0000-000000000000',
    'desired_bookkeeping_support', v_answers->>'a6000046-0000-0000-0000-000000000000',
    'desired_involvement', v_answers->>'a6000047-0000-0000-0000-000000000000',
    'has_tax_professional', v_answers->>'a600003c-0000-0000-0000-000000000000',
    'tax_preparer_separate', v_answers->>'a600003d-0000-0000-0000-000000000000',
    'consultation_goals', v_answers->>'a6000040-0000-0000-0000-000000000000'
  ))
  where id = NEW.client_id;

  -- Every submission
  v_tags := v_tags || array['QB-CONSULT', 'QB-INTAKE-SUBMITTED'];

  -- QuickBooks status
  if v_answers->>'a6000017-0000-0000-0000-000000000000' = 'no' then
    v_tags := v_tags || array['QB-NEW-SETUP'];
  elsif v_answers->>'a6000017-0000-0000-0000-000000000000' = 'yes' then
    v_tags := v_tags || array['QB-EXISTING'];
  end if;

  -- Bookkeeping lead score. Every leaf comparison is coalesced to false --
  -- an unanswered field compares to NULL (unknown), and NULL propagating
  -- through these OR/AND chains would silently turn a should-be-false
  -- result into NULL, which "not v_is_hot and ..." then treats as neither
  -- true nor false and every branch below it goes untagged.
  v_is_hot := coalesce(v_answers->>'a6000045-0000-0000-0000-000000000000' = 'yes', false)
    or coalesce(v_answers->>'a600002d-0000-0000-0000-000000000000' = 'professional_manage', false)
    or coalesce(v_answers->>'a600002f-0000-0000-0000-000000000000' = 'want_someone_else_to_handle_it', false);
  v_is_warm := not v_is_hot and (
    coalesce(v_answers->>'a6000045-0000-0000-0000-000000000000' = 'maybe', false)
    or coalesce(v_answers->>'a600002d-0000-0000-0000-000000000000' = 'guidance', false)
  );
  v_is_self := not v_is_hot and not v_is_warm
    and coalesce(v_answers->>'a6000045-0000-0000-0000-000000000000' = 'no', false)
    and coalesce(v_answers->>'a600002d-0000-0000-0000-000000000000' = 'self_manage', false);

  if v_is_hot then
    v_tags := v_tags || array['BOOKKEEPING-HOT'];
  elsif v_is_warm then
    v_tags := v_tags || array['BOOKKEEPING-WARM'];
  elsif v_is_self then
    v_tags := v_tags || array['BOOKKEEPING-SELF'];
  end if;

  -- Cleanup tags
  v_is_cleanup := coalesce(v_answers->>'a6000029-0000-0000-0000-000000000000' = 'yes', false);
  v_is_catchup := coalesce(v_answers->>'a600002a-0000-0000-0000-000000000000' in ('6_12_months', 'more_than_12_months'), false);
  if v_is_cleanup then
    v_tags := v_tags || array['QB-CLEANUP'];
  end if;
  if v_is_catchup then
    v_tags := v_tags || array['QB-CATCHUP'];
  end if;

  -- Complexity tags
  v_employee_count := nullif(v_answers->>'a6000034-0000-0000-0000-000000000000', '')::numeric;
  v_contractor_count := nullif(v_answers->>'a6000036-0000-0000-0000-000000000000', '')::numeric;
  v_is_complex := coalesce(v_employee_count, 0) > 0
    or coalesce(v_contractor_count, 0) > 0
    or coalesce(v_answers->>'a6000028-0000-0000-0000-000000000000' in ('251_500', '500_plus'), false)
    or v_is_cleanup
    or coalesce((
      select count(*) > 1 from unnest(string_to_array(coalesce(v_answers->>'a6000010-0000-0000-0000-000000000000', ''), ',')) x
    ), false);
  if v_is_complex then
    v_tags := v_tags || array['QB-COMPLEX'];
  else
    v_tags := v_tags || array['QB-STANDARD'];
  end if;

  update public.clients
  set tags = array(select distinct unnest(coalesce(tags, '{}') || v_tags))
  where id = NEW.client_id;

  -- Answer-conditional internal tasks (the generic automations engine has
  -- no primitive that can gate a create_task step on an organizer answer
  -- value, so these two live here instead of in the automation below).
  if v_is_hot then
    insert into public.tasks (workspace_id, client_id, title, description, priority, visibility, related_organizer_response_id)
    values (NEW.workspace_id, NEW.client_id, 'Discuss monthly bookkeeping during consultation',
      'This lead qualified as a hot bookkeeping opportunity. Bring up monthly bookkeeping during the paid consultation -- do not move them to Bookkeeping Opportunity until the consultation actually happens.',
      'high', 'internal', NEW.id);
  end if;

  if v_is_cleanup then
    insert into public.tasks (workspace_id, client_id, title, description, priority, visibility, related_organizer_response_id)
    values (NEW.workspace_id, NEW.client_id, 'Review cleanup scope before consultation',
      'Books need cleanup/catch-up. Review the reported scope (months and transaction volume) before the consultation so pricing can be discussed.',
      'medium', 'internal', NEW.id);
  end if;

  return NEW;
end;
$function$;

drop trigger if exists trg_apply_qb_intake_qualification on public.organizer_responses;
create trigger trg_apply_qb_intake_qualification
  after insert or update on public.organizer_responses
  for each row execute function public.apply_qb_intake_qualification();

-- ============================================================================
-- 6. Automation: "QuickBooks Intake Received" -- everything that doesn't
--    require reading an individual answer's value. Reuses existing
--    action_types only (move_lead_to_service_pipeline, assign_user,
--    create_task, send_email). Left disabled for review before it starts
--    emailing real prospects, matching this codebase's convention for new
--    automations that send real email/SMS.
-- ============================================================================

insert into public.email_templates (id, workspace_id, name, slug, category, subject, body_html, status)
values ('a9000000-0000-0000-0000-000000000001', '2896bf43-95db-420f-9bb5-8854f537bbd1',
  'QuickBooks Consultation Confirmation', 'quickbooks-consultation-confirmation', 'lead_intake',
  'We received your QuickBooks consultation request',
  '<p>Hello {{first_name}},</p>' ||
  '<p>Thank you for requesting a QuickBooks Setup & Bookkeeping Consultation with MKB Financial Group.</p>' ||
  '<p>We received the information you submitted about {{business_name}}. Our team will review it and reach out shortly to schedule your 90-minute consultation ($250).</p>' ||
  '<p>During your consultation, we''ll cover QuickBooks setup, review your current bookkeeping situation, and answer the questions you shared with us.</p>' ||
  '<p>If you have any questions in the meantime, contact us at {{office_phone}} or {{office_email}}.</p>' ||
  '<p>MKB Financial Group<br>{{office_phone}}<br>{{office_email}}</p>',
  'published')
on conflict (id) do nothing;

insert into public.automations (id, workspace_id, name, slug, trigger_type, trigger_config, conditions, is_enabled, status)
values ('a7000000-0000-0000-0000-000000000001', '2896bf43-95db-420f-9bb5-8854f537bbd1',
  'QuickBooks Intake Received', 'quickbooks-intake-received', 'organizer.submitted',
  jsonb_build_object('organizer_template_id', 'a5000000-0000-0000-0000-000000000001'),
  '[]'::jsonb, false, 'published')
on conflict (id) do nothing;

insert into public.automation_steps (id, automation_id, action_type, action_config, display_order) values
('a8000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000001', 'move_lead_to_service_pipeline', '{}'::jsonb, 0),
('a8000000-0000-0000-0000-000000000002', 'a7000000-0000-0000-0000-000000000001', 'assign_user',
  jsonb_build_object('target', 'client', 'assignment_mode', 'round_robin'), 1),
('a8000000-0000-0000-0000-000000000003', 'a7000000-0000-0000-0000-000000000001', 'create_task',
  jsonb_build_object('title', 'Review QuickBooks consultation intake',
    'description', 'A new QuickBooks Setup & Bookkeeping Consultation intake was submitted. Review the answers and tags, then reach out to schedule the paid consultation.',
    'due_in_days', 1, 'priority', 'high'), 2),
('a8000000-0000-0000-0000-000000000004', 'a7000000-0000-0000-0000-000000000001', 'send_email',
  jsonb_build_object('template_slug', 'quickbooks-consultation-confirmation'), 3)
on conflict (id) do nothing;

insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, sort_order) values
('a7000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000002', 0),
('a7000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000002', 'a8000000-0000-0000-0000-000000000003', 0),
('a7000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000003', 'a8000000-0000-0000-0000-000000000004', 0)
on conflict do nothing;

-- ============================================================================
-- 7. Automation: "Consultation Completed -- Determine Next Step"
--    trigger_type lead.stage_entered, scoped to the Consultation Completed
--    stage of this pipeline. Creates the internal task that prompts staff
--    to fill in the (internal-only) Consultation Outcome field. The actual
--    routing to Bookkeeping Opportunity / Not Pursuing based on that
--    outcome is a manual stage move by staff -- there is no trigger_type in
--    this system for "an internal organizer field was answered outside of
--    submission", so automating that last step would require new engine
--    infrastructure the spec asked us not to add.
-- ============================================================================

insert into public.automations (id, workspace_id, name, slug, trigger_type, trigger_config, conditions, is_enabled, status)
values ('a7000000-0000-0000-0000-000000000002', '2896bf43-95db-420f-9bb5-8854f537bbd1',
  'QuickBooks Consultation Completed', 'quickbooks-consultation-completed', 'lead.stage_entered',
  jsonb_build_object('process_id', 'a3000000-0000-0000-0000-000000000001', 'process_stage_id', 'a4000000-0000-0000-0000-000000000003'),
  '[]'::jsonb, false, 'published')
on conflict (id) do nothing;

insert into public.automation_steps (id, automation_id, action_type, action_config, display_order) values
('a8000000-0000-0000-0000-000000000005', 'a7000000-0000-0000-0000-000000000002', 'create_task',
  jsonb_build_object('title', 'Determine consultation outcome',
    'description', 'Determine whether this prospect needs QuickBooks setup only, cleanup, ongoing bookkeeping, or no additional service. Record the outcome on the intake''s Consultation Outcome field, then move the pipeline stage accordingly: Setup Only -> Not Pursuing; Monthly Bookkeeping Opportunity, Cleanup Needed, or Cleanup + Monthly Bookkeeping -> Bookkeeping Opportunity.',
    'due_in_days', 1, 'priority', 'high'), 0)
on conflict (id) do nothing;
