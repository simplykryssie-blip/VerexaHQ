-- MKB Financial Group -- upgrade the existing "Bookkeeping Services Assessment"
-- organizer template (id 283d6989-94b2-45d8-8eed-4f91702950f1) into a complete
-- bookkeeping scoping assessment, per explicit client request.
--
-- Constraints honored: no new form, no deletions, existing fields/branding/page
-- order preserved. All 52 existing rows keep their id/label/options/
-- conditional_logic/is_required/client_profile_field unchanged -- only their
-- display_order is renumbered (old_order * 100) to open room for insertions.
-- Four existing fields get an *options* refinement only (explicitly requested
-- bucket-scheme upgrades for the same question -- "months behind", vendor-bill
-- count, customer-invoice count, payroll frequency), never a label/id change.
--
-- New client-facing conditional fields are all is_required = false. Verified
-- live (this session) that both organizer renderers (components/portal/
-- OrganizerForm.tsx, components/organizer/PublicOrganizerForm.tsx) correctly
-- exclude hidden fields from unmetRequiredOnCurrentPage(), so a hidden
-- required field could never have blocked submission either way -- false is
-- simply the more conservative choice for a scoping assessment that must
-- never interrogate the client into a corner ("Not Sure" stays a legitimate,
-- non-blocking answer everywhere).
--
-- New internal-only assessment/pricing fields (is_internal_only = true) are
-- confirmed (same verification) to be excluded from both the portal fetch
-- (app/portal/(portal)/organizer/[id]/page.tsx) and the public-link RPC
-- (get_public_organizer_template) -- never client-visible.
--
-- Two new fields are referenced as conditional triggers by other new fields,
-- so (matching this template's own existing convention of hand-picked ids for
-- its two internal fields) they're given deliberate, obviously-synthetic ids
-- instead of gen_random_uuid():
--   a1100000-0000-0000-0000-000000000001 = "Are all active financial accounts
--     currently reconciled?" (triggers the not-reconciled follow-up)
--   a1100000-0000-0000-0000-000000000002 = "Additional Business Entities"
--     repeating section (parent for the 5 per-entity child fields)

-- 1) Renumber all 52 existing rows to open gaps for insertion. Content
--    untouched -- order only.
update public.organizer_fields
set display_order = display_order * 100
where organizer_template_id = '283d6989-94b2-45d8-8eed-4f91702950f1';

-- 2) Refine option buckets on 4 existing fields per the client's updated
--    pricing/assessment reference (same question, same id, same trigger --
--    just a more precise bucket scheme). Nothing else on these rows changes.
update public.organizer_fields
set options = '[
  {"label":"Less than 1 month","value":"less_1_month"},
  {"label":"1-3 months","value":"1_3_months"},
  {"label":"4-6 months","value":"4_6_months"},
  {"label":"7-12 months","value":"7_12_months"},
  {"label":"More than 12 months","value":"12_plus_months"},
  {"label":"Multiple years","value":"multiple_years"},
  {"label":"Not Sure","value":"not_sure"}
]'::jsonb
where id = '8e18732a-5fb9-4ec8-883f-47886ba1d30b';

update public.organizer_fields
set options = '[
  {"label":"0","value":"0"},
  {"label":"1-25","value":"1_25"},
  {"label":"26-50","value":"26_50"},
  {"label":"51-100","value":"51_100"},
  {"label":"101-200","value":"101_200"},
  {"label":"More than 200","value":"200_plus"},
  {"label":"Not Sure","value":"not_sure"}
]'::jsonb
where id in ('e980b133-d28a-418f-bee4-297e78e430fa', 'bba2c099-1c6a-4899-9bca-8eedf2143b93');

update public.organizer_fields
set options = '[
  {"label":"Weekly","value":"weekly"},
  {"label":"Biweekly","value":"biweekly"},
  {"label":"Semimonthly","value":"semimonthly"},
  {"label":"Monthly","value":"monthly"},
  {"label":"Other","value":"other"},
  {"label":"Not Sure","value":"not_sure"}
]'::jsonb
where id = 'a105864b-b76f-48f8-95e1-579100b067de';

-- 3) Insert every new field. display_order values are chosen from the *100
--    renumbering above (e.g. 1900 = "Current Books & Add-Ons" page break,
--    2000 = "When were your books last reconciled?") with room to spare
--    between every pair of existing rows.
insert into public.organizer_fields
  (id, organizer_template_id, parent_field_id, field_type, label, help_text, display_order, is_required, options, conditional_logic, client_profile_field, is_internal_only)
values

-- ===== Business Profile page: current bookkeeping responsibility =====
-- (kept on the "Current Books & Add-Ons" page instead, see below -- more
-- context-appropriate placement for "who currently does the books" than the
-- structural Business Profile page, without disrupting either page's flow.)

-- ===== QuickBooks Status page (page break @1200; question @1300) =====
(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'radio_button',
  'What version of QuickBooks are you currently using?', null, 1310, false,
  '[{"label":"QuickBooks Online","value":"qbo"},{"label":"QuickBooks Desktop","value":"qb_desktop"},{"label":"Not Sure","value":"not_sure"}]'::jsonb,
  '{"show_if":{"match":"all","conditions":[{"field_id":"dfd23a1d-b7a7-4ab4-aa03-33e65fb16444","operator":"equals","value":"yes"}]}}'::jsonb,
  null, false),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'dropdown',
  'Approximately how long has the QuickBooks company been in use?', null, 1320, false,
  '[{"label":"Less than 1 year","value":"less_1_year"},{"label":"1-3 years","value":"1_3_years"},{"label":"4-5 years","value":"4_5_years"},{"label":"More than 5 years","value":"5_plus_years"},{"label":"Not Sure","value":"not_sure"}]'::jsonb,
  '{"show_if":{"match":"all","conditions":[{"field_id":"dfd23a1d-b7a7-4ab4-aa03-33e65fb16444","operator":"equals","value":"yes"}]}}'::jsonb,
  null, false),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'radio_button',
  'Are the bank accounts connected to QuickBooks?', null, 1330, false,
  '[{"label":"Yes","value":"yes"},{"label":"Some are","value":"some"},{"label":"No","value":"no"},{"label":"Not Sure","value":"not_sure"}]'::jsonb,
  '{"show_if":{"match":"all","conditions":[{"field_id":"dfd23a1d-b7a7-4ab4-aa03-33e65fb16444","operator":"equals","value":"yes"}]}}'::jsonb,
  null, false),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'radio_button',
  'Are the business credit cards connected to QuickBooks?', null, 1340, false,
  '[{"label":"Yes","value":"yes"},{"label":"Some are","value":"some"},{"label":"No","value":"no"},{"label":"Not Sure","value":"not_sure"},{"label":"No business credit cards","value":"no_business_credit_cards"}]'::jsonb,
  '{"show_if":{"match":"all","conditions":[{"field_id":"dfd23a1d-b7a7-4ab4-aa03-33e65fb16444","operator":"equals","value":"yes"}]}}'::jsonb,
  null, false),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'radio_button',
  'Is the chart of accounts currently established?', null, 1350, false,
  '[{"label":"Yes","value":"yes"},{"label":"No","value":"no"},{"label":"Not Sure","value":"not_sure"}]'::jsonb,
  '{"show_if":{"match":"all","conditions":[{"field_id":"dfd23a1d-b7a7-4ab4-aa03-33e65fb16444","operator":"equals","value":"yes"}]}}'::jsonb,
  null, false),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'dropdown',
  'Does the QuickBooks file need setup, restructuring, or correction?', null, 1360, false,
  '[{"label":"No","value":"none"},{"label":"Setup","value":"setup"},{"label":"Restructuring","value":"restructuring"},{"label":"Correction/Cleanup","value":"correction_cleanup"},{"label":"Not Sure","value":"not_sure"}]'::jsonb,
  '{"show_if":{"match":"all","conditions":[{"field_id":"dfd23a1d-b7a7-4ab4-aa03-33e65fb16444","operator":"equals","value":"yes"}]}}'::jsonb,
  null, false),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'radio_button',
  'Does the business currently have a bookkeeper or accountant with access?', null, 1370, false,
  '[{"label":"Yes","value":"yes"},{"label":"No","value":"no"},{"label":"Not Sure","value":"not_sure"}]'::jsonb,
  '{"show_if":{"match":"all","conditions":[{"field_id":"dfd23a1d-b7a7-4ab4-aa03-33e65fb16444","operator":"equals","value":"yes"}]}}'::jsonb,
  null, false),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'radio_button',
  'What type of QuickBooks assistance are you looking for?', null, 1380, false,
  '[{"label":"QuickBooks setup","value":"setup"},{"label":"Help choosing the appropriate QuickBooks option","value":"help_choosing"},{"label":"QuickBooks consultation","value":"consultation"},{"label":"Not sure","value":"not_sure"},{"label":"Other","value":"other"}]'::jsonb,
  '{"show_if":{"match":"all","conditions":[{"field_id":"dfd23a1d-b7a7-4ab4-aa03-33e65fb16444","operator":"equals","value":"no"}]}}'::jsonb,
  null, false),

-- ===== Current Books & Add-Ons page (page break @1900) =====
(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'radio_button',
  'Who currently maintains the business books?', null, 1950, false,
  '[{"label":"Business owner","value":"business_owner"},{"label":"Internal employee","value":"internal_employee"},{"label":"Bookkeeper","value":"bookkeeper"},{"label":"CPA/accounting firm","value":"cpa_accounting_firm"},{"label":"Multiple people","value":"multiple_people"},{"label":"No one currently maintains them","value":"no_one"},{"label":"Other","value":"other"}]'::jsonb,
  '{}'::jsonb, null, false),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'dropdown',
  'How are the books currently maintained?', null, 1960, false,
  '[{"label":"Regularly maintained","value":"regularly"},{"label":"Maintained inconsistently","value":"inconsistently"},{"label":"Only updated when needed","value":"only_when_needed"},{"label":"Behind","value":"behind"},{"label":"Not maintained","value":"not_maintained"},{"label":"Not sure","value":"not_sure"}]'::jsonb,
  '{}'::jsonb, null, false),

-- (2000 = existing "When were your books last reconciled?")

-- Deliberate synthetic id (see header note): referenced as a trigger by the
-- next field below. Confirmed live: a first pass of this migration used
-- gen_random_uuid() here by mistake, silently orphaning the dependent
-- field's show_if -- fixed in production via a follow-up statement, and
-- fixed here at the source so a fresh apply produces the same correct
-- result in one pass.
('a1100000-0000-0000-0000-000000000001', '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'radio_button',
  'Are all active financial accounts currently reconciled?', null, 2050, false,
  '[{"label":"Yes","value":"yes"},{"label":"No","value":"no"},{"label":"Some are reconciled","value":"some_are_reconciled"},{"label":"Not Sure","value":"not_sure"}]'::jsonb,
  '{}'::jsonb, null, false),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'paragraph',
  'Which accounts are not currently reconciled?', null, 2060, false, '[]'::jsonb,
  '{"show_if":{"match":"any","conditions":[{"field_id":"a1100000-0000-0000-0000-000000000001","operator":"equals","value":"no"},{"field_id":"a1100000-0000-0000-0000-000000000001","operator":"equals","value":"some_are_reconciled"}]}}'::jsonb,
  null, false),

-- (2100 = existing "Are your books currently up to date?"; 2200 = existing
-- "Approximately how many months are behind?", options refined above)

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'short_text',
  'Which periods need to be brought current?', 'For example, list the specific months or quarters that still need to be caught up.', 2160, false, '[]'::jsonb,
  '{"show_if":{"match":"any","conditions":[{"field_id":"2aee47db-d13d-4e23-b7de-d38e259085bc","operator":"equals","value":"behind"},{"field_id":"2aee47db-d13d-4e23-b7de-d38e259085bc","operator":"equals","value":"both"}]}}'::jsonb,
  null, false),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'checkbox',
  'What areas need catch-up or cleanup?', null, 2170, false,
  '[{"label":"Bank transactions","value":"bank_transactions"},{"label":"Credit-card transactions","value":"credit_card_transactions"},{"label":"Loan accounts","value":"loan_accounts"},{"label":"Uncategorized transactions","value":"uncategorized_transactions"},{"label":"Duplicate transactions","value":"duplicate_transactions"},{"label":"Missing transactions","value":"missing_transactions"},{"label":"Incorrect categorization","value":"incorrect_categorization"},{"label":"Bank reconciliation","value":"bank_reconciliation"},{"label":"Credit-card reconciliation","value":"credit_card_reconciliation"},{"label":"A/P","value":"ap"},{"label":"A/R","value":"ar"},{"label":"Payroll bookkeeping","value":"payroll_bookkeeping"},{"label":"Chart of accounts","value":"chart_of_accounts"},{"label":"Opening balances","value":"opening_balances"},{"label":"Financial statement corrections","value":"financial_statement_corrections"},{"label":"Other","value":"other"},{"label":"Not Sure","value":"not_sure"}]'::jsonb,
  '{"show_if":{"match":"any","conditions":[{"field_id":"2aee47db-d13d-4e23-b7de-d38e259085bc","operator":"equals","value":"behind"},{"field_id":"2aee47db-d13d-4e23-b7de-d38e259085bc","operator":"equals","value":"both"},{"field_id":"2aee47db-d13d-4e23-b7de-d38e259085bc","operator":"equals","value":"cleanup"}]}}'::jsonb,
  null, false),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'yes_no',
  'Would you like MKB to assess the condition of your books?', null, 2180, false, '[]'::jsonb,
  '{"show_if":{"match":"all","conditions":[{"field_id":"2aee47db-d13d-4e23-b7de-d38e259085bc","operator":"equals","value":"not_sure"}]}}'::jsonb,
  null, false),

-- (2300 = existing add-ons checkbox; 2400 = existing vendor-bill count,
-- options refined above)

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'radio_button',
  'How is Accounts Payable currently handled?', null, 2450, false,
  '[{"label":"No formal A/P process","value":"none"},{"label":"Spreadsheet","value":"spreadsheet"},{"label":"QuickBooks","value":"quickbooks"},{"label":"Bill payment software","value":"bill_payment_software"},{"label":"Other","value":"other"},{"label":"Not Sure","value":"not_sure"}]'::jsonb,
  '{"show_if":{"match":"all","conditions":[{"field_id":"24c844b0-5136-432f-b17a-c04e9c94b92e","operator":"includes","value":"ap"}]}}'::jsonb,
  null, false),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'radio_button',
  'What A/P support are you looking for?', 'This describes bookkeeping/recording scope only. It does not include paying bills, scheduling payments, approving payments, collecting from vendors, or managing vendor relationships unless separately scoped.', 2460, false,
  '[{"label":"Record bills only","value":"record_only"},{"label":"Track outstanding bills","value":"track_outstanding"},{"label":"Maintain A/P records","value":"maintain_records"},{"label":"Other","value":"other"},{"label":"Not Sure","value":"not_sure"}]'::jsonb,
  '{"show_if":{"match":"all","conditions":[{"field_id":"24c844b0-5136-432f-b17a-c04e9c94b92e","operator":"includes","value":"ap"}]}}'::jsonb,
  null, false),

-- (2500 = existing customer-invoice count, options refined above)

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'radio_button',
  'How is Accounts Receivable currently tracked?', null, 2550, false,
  '[{"label":"QuickBooks","value":"quickbooks"},{"label":"Spreadsheet","value":"spreadsheet"},{"label":"Accounting/bookkeeping software","value":"accounting_software"},{"label":"Other","value":"other"},{"label":"Not Sure","value":"not_sure"}]'::jsonb,
  '{"show_if":{"match":"all","conditions":[{"field_id":"24c844b0-5136-432f-b17a-c04e9c94b92e","operator":"includes","value":"ar"}]}}'::jsonb,
  null, false),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'radio_button',
  'What A/R support are you looking for?', 'This describes bookkeeping/recording scope only. It does not automatically imply collection services unless separately scoped.', 2560, false,
  '[{"label":"Record invoices","value":"record_invoices"},{"label":"Track outstanding receivables","value":"track_outstanding"},{"label":"Maintain A/R records","value":"maintain_records"},{"label":"Other","value":"other"},{"label":"Not Sure","value":"not_sure"}]'::jsonb,
  '{"show_if":{"match":"all","conditions":[{"field_id":"24c844b0-5136-432f-b17a-c04e9c94b92e","operator":"includes","value":"ar"}]}}'::jsonb,
  null, false),

-- (2600-2900 = existing employees/employee-count/payroll-frequency
-- (options refined above)/owners-paid-through-payroll)

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'radio_button',
  'Who processes payroll?', null, 2950, false,
  '[{"label":"Business owner","value":"business_owner"},{"label":"Internal employee","value":"internal_employee"},{"label":"Payroll provider","value":"payroll_provider"},{"label":"CPA/accounting firm","value":"cpa_accounting_firm"},{"label":"Other","value":"other"},{"label":"Not Sure","value":"not_sure"}]'::jsonb,
  '{"show_if":{"match":"any","conditions":[{"field_id":"24c844b0-5136-432f-b17a-c04e9c94b92e","operator":"includes","value":"payroll_bookkeeping"},{"field_id":"42b01b10-242b-4746-a9ee-bcadc12cc375","operator":"equals","value":"yes"}]}}'::jsonb,
  null, false),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'short_text',
  'What payroll provider/software is currently used?', null, 2960, false, '[]'::jsonb,
  '{"show_if":{"match":"any","conditions":[{"field_id":"24c844b0-5136-432f-b17a-c04e9c94b92e","operator":"includes","value":"payroll_bookkeeping"},{"field_id":"42b01b10-242b-4746-a9ee-bcadc12cc375","operator":"equals","value":"yes"}]}}'::jsonb,
  null, false),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'paragraph',
  'What bookkeeping support is needed for payroll and contractor activity?', 'Payroll bookkeeping is assessed and scoped individually by MKB; this form does not generate a fixed payroll price.', 2970, false, '[]'::jsonb,
  '{"show_if":{"match":"any","conditions":[{"field_id":"24c844b0-5136-432f-b17a-c04e9c94b92e","operator":"includes","value":"payroll_bookkeeping"},{"field_id":"42b01b10-242b-4746-a9ee-bcadc12cc375","operator":"equals","value":"yes"}]}}'::jsonb,
  null, false),

-- (3000-3400 = existing contractors/contractor-count/sales-tax/jurisdiction/filing-frequency)

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'radio_button',
  'Is sales tax currently being tracked and recorded correctly in the accounting system?', null, 3450, false,
  '[{"label":"Yes","value":"yes"},{"label":"No","value":"no"},{"label":"Not Sure","value":"not_sure"}]'::jsonb,
  '{"show_if":{"match":"all","conditions":[{"field_id":"ec1dc7c2-a531-48ff-9fe5-885570dfc9ad","operator":"equals","value":"yes"}]}}'::jsonb,
  null, false),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'radio_button',
  'Does the business need bookkeeping support related to sales tax?', 'Sales Tax Compliance is scoped and priced separately from bookkeeping and is not automatically included.', 3460, false,
  '[{"label":"Yes","value":"yes"},{"label":"No","value":"no"},{"label":"Not Sure","value":"not_sure"}]'::jsonb,
  '{"show_if":{"match":"all","conditions":[{"field_id":"ec1dc7c2-a531-48ff-9fe5-885570dfc9ad","operator":"equals","value":"yes"}]}}'::jsonb,
  null, false),

-- ===== Complexity & Documents page (page break @3500) =====
-- (3600 = existing "Would you like ongoing receipt & document management?")

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'dropdown',
  'Approximately how many receipts or financial documents does the business generate or need organized each month?', null, 3650, false,
  '[{"label":"1-25","value":"1_25"},{"label":"26-50","value":"26_50"},{"label":"51-100","value":"51_100"},{"label":"101-200","value":"101_200"},{"label":"More than 200","value":"200_plus"},{"label":"Not Sure","value":"not_sure"}]'::jsonb,
  '{"show_if":{"match":"all","conditions":[{"field_id":"c45fde9f-f7ff-4f75-ad61-f5936c3f5934","operator":"equals","value":"yes"}]}}'::jsonb,
  null, false),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'checkbox',
  'How are receipts/documents currently stored?', null, 3660, false,
  '[{"label":"QuickBooks","value":"quickbooks"},{"label":"Cloud storage","value":"cloud_storage"},{"label":"Paper","value":"paper"},{"label":"Email","value":"email"},{"label":"Multiple systems","value":"multiple_systems"},{"label":"Not organized","value":"not_organized"},{"label":"Other","value":"other"}]'::jsonb,
  '{"show_if":{"match":"all","conditions":[{"field_id":"c45fde9f-f7ff-4f75-ad61-f5936c3f5934","operator":"equals","value":"yes"}]}}'::jsonb,
  null, false),

-- (3700 = existing "Are business and personal transactions completely separated?")

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'dropdown',
  'Approximately how often do business and personal transactions get mixed?', null, 3750, false,
  '[{"label":"Rarely","value":"rarely"},{"label":"Occasionally","value":"occasionally"},{"label":"Frequently","value":"frequently"},{"label":"Very frequently","value":"very_frequently"},{"label":"Not Sure","value":"not_sure"}]'::jsonb,
  '{"show_if":{"match":"any","conditions":[{"field_id":"856fb786-ce0f-4c30-b589-5119c76f0535","operator":"equals","value":"no"},{"field_id":"856fb786-ce0f-4c30-b589-5119c76f0535","operator":"equals","value":"mostly"}]}}'::jsonb,
  null, false),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'radio_button',
  'Does this need to be reviewed or corrected as part of bookkeeping?', null, 3760, false,
  '[{"label":"Yes","value":"yes"},{"label":"No","value":"no"},{"label":"Not Sure","value":"not_sure"}]'::jsonb,
  '{"show_if":{"match":"any","conditions":[{"field_id":"856fb786-ce0f-4c30-b589-5119c76f0535","operator":"equals","value":"no"},{"field_id":"856fb786-ce0f-4c30-b589-5119c76f0535","operator":"equals","value":"mostly"}]}}'::jsonb,
  null, false),

-- (3800 = existing "Does the business carry inventory?")

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'radio_button',
  'How is inventory currently tracked?', null, 3850, false,
  '[{"label":"QuickBooks","value":"quickbooks"},{"label":"Inventory management software","value":"inventory_software"},{"label":"Spreadsheet","value":"spreadsheet"},{"label":"Manual","value":"manual"},{"label":"Not Sure","value":"not_sure"},{"label":"Other","value":"other"}]'::jsonb,
  '{"show_if":{"match":"all","conditions":[{"field_id":"117ccac2-1c0b-40bf-a65a-54e16b33f88f","operator":"equals","value":"yes"}]}}'::jsonb,
  null, false),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'radio_button',
  'Does inventory require bookkeeping/reconciliation support?', null, 3860, false,
  '[{"label":"Yes","value":"yes"},{"label":"No","value":"no"},{"label":"Not Sure","value":"not_sure"}]'::jsonb,
  '{"show_if":{"match":"all","conditions":[{"field_id":"117ccac2-1c0b-40bf-a65a-54e16b33f88f","operator":"equals","value":"yes"}]}}'::jsonb,
  null, false),

-- (3900 = existing "Does the business have significant equipment, vehicles, or other assets...")

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'checkbox',
  'What types of assets require bookkeeping/accounting attention?', null, 3950, false,
  '[{"label":"Equipment","value":"equipment"},{"label":"Vehicles","value":"vehicles"},{"label":"Property","value":"property"},{"label":"Large purchases","value":"large_purchases"},{"label":"Depreciable assets","value":"depreciable_assets"},{"label":"Other","value":"other"},{"label":"Not Sure","value":"not_sure"}]'::jsonb,
  '{"show_if":{"match":"all","conditions":[{"field_id":"2863ed50-a548-44ad-9d29-dc9458fd5987","operator":"equals","value":"yes"}]}}'::jsonb,
  null, false),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'radio_button',
  'Does the business currently track these assets in its accounting system?', null, 3960, false,
  '[{"label":"Yes","value":"yes"},{"label":"No","value":"no"},{"label":"Not Sure","value":"not_sure"}]'::jsonb,
  '{"show_if":{"match":"all","conditions":[{"field_id":"2863ed50-a548-44ad-9d29-dc9458fd5987","operator":"equals","value":"yes"}]}}'::jsonb,
  null, false),

-- (4000 = existing "Does the business have multiple legal entities that may need separate books?")

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'dropdown',
  'How many separate legal entities require bookkeeping?', null, 4050, false,
  '[{"label":"1","value":"1"},{"label":"2","value":"2"},{"label":"3","value":"3"},{"label":"4+","value":"4_plus"},{"label":"Not Sure","value":"not_sure"}]'::jsonb,
  '{"show_if":{"match":"all","conditions":[{"field_id":"42b6415a-c939-4269-8047-8c56350b7827","operator":"equals","value":"yes"}]}}'::jsonb,
  null, false),

('a1100000-0000-0000-0000-000000000002', '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'repeating_section',
  'Additional Business Entities', 'Add one entry for each additional legal entity that needs its own bookkeeping.', 4060, false, '[]'::jsonb,
  '{"show_if":{"match":"all","conditions":[{"field_id":"42b6415a-c939-4269-8047-8c56350b7827","operator":"equals","value":"yes"}]}}'::jsonb,
  null, false),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', 'a1100000-0000-0000-0000-000000000002', 'short_text',
  'Entity name', null, 4061, false, '[]'::jsonb, '{}'::jsonb, null, false),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', 'a1100000-0000-0000-0000-000000000002', 'dropdown',
  'Entity type', null, 4062, false,
  '[{"label":"Sole Proprietorship","value":"sole_proprietorship"},{"label":"Single-Member LLC","value":"single_member_llc"},{"label":"Multi-Member LLC","value":"multi_member_llc"},{"label":"S Corporation","value":"s_corporation"},{"label":"C Corporation","value":"c_corporation"},{"label":"Partnership","value":"partnership"},{"label":"Other","value":"other"},{"label":"Not Sure","value":"not_sure"}]'::jsonb,
  '{}'::jsonb, null, false),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', 'a1100000-0000-0000-0000-000000000002', 'yes_no',
  'Separate QuickBooks file?', null, 4063, false, '[]'::jsonb, '{}'::jsonb, null, false),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', 'a1100000-0000-0000-0000-000000000002', 'dropdown',
  'Approximate financial accounts', null, 4064, false,
  '[{"label":"1-3","value":"1_3"},{"label":"4-5","value":"4_5"},{"label":"6-8","value":"6_8"},{"label":"9-12","value":"9_12"},{"label":"13+","value":"13_plus"},{"label":"Not Sure","value":"not_sure"}]'::jsonb,
  '{}'::jsonb, null, false),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', 'a1100000-0000-0000-0000-000000000002', 'dropdown',
  'Approximate monthly transactions', null, 4065, false,
  '[{"label":"0-150","value":"0_150"},{"label":"151-400","value":"151_400"},{"label":"401-750","value":"401_750"},{"label":"751-1500","value":"751_1500"},{"label":"1501+","value":"1501_plus"},{"label":"Not Sure","value":"not_sure"}]'::jsonb,
  '{}'::jsonb, null, false),

-- ===== New section: Financial Reporting Needs (page break @4080) =====
(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'page_break',
  'Financial Reporting Needs', null, 4080, false, '[]'::jsonb, '{}'::jsonb, null, false),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'checkbox',
  'Which financial reports do you currently need?', null, 4090, false,
  '[{"label":"Profit & Loss","value":"profit_loss"},{"label":"Balance Sheet","value":"balance_sheet"},{"label":"Cash Flow","value":"cash_flow"},{"label":"Budget vs. Actual","value":"budget_vs_actual"},{"label":"Monthly financial reporting","value":"monthly_reporting"},{"label":"Management reporting","value":"management_reporting"},{"label":"Lender reporting","value":"lender_reporting"},{"label":"Investor reporting","value":"investor_reporting"},{"label":"Other","value":"other"},{"label":"Not Sure","value":"not_sure"}]'::jsonb,
  '{}'::jsonb, null, false),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'dropdown',
  'How often do you need financial reports?', null, 4095, false,
  '[{"label":"Monthly","value":"monthly"},{"label":"Quarterly","value":"quarterly"},{"label":"As needed","value":"as_needed"},{"label":"Other","value":"other"},{"label":"Not Sure","value":"not_sure"}]'::jsonb,
  '{}'::jsonb, null, false),

-- ===== Final Details page: internal-only MKB assessment/pricing result =====
-- (4100 = existing "Final Details" page break; 4200-4900 = existing fields
-- through the second acknowledgment. Every field below is is_internal_only =
-- true -- confirmed excluded from both client-facing renderers -- and sits
-- ahead of the template's existing two internal fields at 5000/5100, which
-- are left completely untouched.)

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'dropdown',
  'Bookkeeping Condition', null, 4901, false,
  '[{"label":"Current","value":"current"},{"label":"Catch-Up Required","value":"catch_up_required"},{"label":"Cleanup Required","value":"cleanup_required"},{"label":"Historical Cleanup Required","value":"historical_cleanup_required"},{"label":"Setup Required","value":"setup_required"},{"label":"Further Assessment Required","value":"further_assessment_required"}]'::jsonb,
  '{}'::jsonb, null, true),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'dropdown',
  'Recommended Bookkeeping Tier', 'Current MKB pricing: Tier 1 $399/mo (up to 150 transactions / 3 accounts); Tier 2 $549/mo (up to 400 transactions / 5 accounts); Tier 3 $739/mo (up to 8 accounts); Tier 4 $999/mo (up to 12 accounts). Do not use any older bookkeeping pricing.', 4902, false,
  '[{"label":"Tier 1","value":"tier_1"},{"label":"Tier 2","value":"tier_2"},{"label":"Tier 3","value":"tier_3"},{"label":"Tier 4","value":"tier_4"},{"label":"Custom / Further Assessment","value":"custom"}]'::jsonb,
  '{}'::jsonb, null, true),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'currency',
  'Base Monthly Price', null, 4903, false, '[]'::jsonb, '{}'::jsonb, null, true),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'number',
  'Additional Financial Accounts', 'Count of accounts beyond the recommended tier''s allowance. MKB pricing rule: +$50/month per additional account.', 4904, false, '[]'::jsonb, '{}'::jsonb, null, true),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'number',
  'Additional Entity/Location', 'MKB pricing rule: additional entities/locations start at +$150/month and are complexity-based.', 4905, false, '[]'::jsonb, '{}'::jsonb, null, true),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'currency',
  'Bookkeeping Frequency Adjustment', 'MKB pricing rule: Monthly = base, Biweekly = +$150/month, Weekly = +$300/month.', 4906, false, '[]'::jsonb, '{}'::jsonb, null, true),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'radio_button',
  'A/P Recommendation', 'A/P pricing (recording-only): up to 25 bills $100/mo, up to 50 $175/mo, up to 100 $300/mo, up to 200 $450/mo. Recording/bookkeeping scope only -- never bill payment, scheduling, approvals, or vendor relationship management unless separately scoped.', 4907, false,
  '[{"label":"Not Needed","value":"not_needed"},{"label":"Included - Recording Only","value":"included_recording_only"},{"label":"Separately Scoped","value":"separately_scoped"},{"label":"Needs Review","value":"needs_review"}]'::jsonb,
  '{}'::jsonb, null, true),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'radio_button',
  'A/R Recommendation', 'A/R pricing (recording-only): up to 25 invoices $100/mo, up to 50 $175/mo, up to 100 $300/mo, up to 200 $450/mo. Recording/bookkeeping scope only -- never implies collections unless separately scoped.', 4908, false,
  '[{"label":"Not Needed","value":"not_needed"},{"label":"Included - Recording Only","value":"included_recording_only"},{"label":"Separately Scoped","value":"separately_scoped"},{"label":"Needs Review","value":"needs_review"}]'::jsonb,
  '{}'::jsonb, null, true),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'radio_button',
  'Receipt/Document Management', 'MKB pricing: +$100/month.', 4909, false,
  '[{"label":"Not Needed","value":"not_needed"},{"label":"Included","value":"included"},{"label":"Separately Scoped","value":"separately_scoped"},{"label":"Needs Review","value":"needs_review"}]'::jsonb,
  '{}'::jsonb, null, true),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'radio_button',
  'Payroll Bookkeeping', 'Assessment/scope-based only. Never assign a fixed payroll price from client answers.', 4910, false,
  '[{"label":"Not Needed","value":"not_needed"},{"label":"Needs MKB Review","value":"needs_mkb_review"},{"label":"Separately Scoped","value":"separately_scoped"}]'::jsonb,
  '{}'::jsonb, null, true),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'radio_button',
  'QuickBooks Setup/Consultation', 'Scope-based, quoted separately from ongoing bookkeeping.', 4911, false,
  '[{"label":"Not Needed","value":"not_needed"},{"label":"Recommended - Separately Scoped","value":"recommended_separately_scoped"}]'::jsonb,
  '{}'::jsonb, null, true),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'radio_button',
  'Catch-Up Bookkeeping', 'Assessment/scope-based one-time service. Never assign a fixed price without sufficient scope.', 4912, false,
  '[{"label":"Not Needed","value":"not_needed"},{"label":"Recommended - Separately Scoped","value":"recommended_separately_scoped"}]'::jsonb,
  '{}'::jsonb, null, true),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'radio_button',
  'Historical Cleanup', 'Assessment/scope-based one-time service. Never assign a fixed price without sufficient scope.', 4913, false,
  '[{"label":"Not Needed","value":"not_needed"},{"label":"Recommended - Separately Scoped","value":"recommended_separately_scoped"}]'::jsonb,
  '{}'::jsonb, null, true),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'paragraph',
  'Other One-Time Services', null, 4914, false, '[]'::jsonb, '{}'::jsonb, null, true),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'currency',
  'Recommended Monthly Service Price', null, 4915, false, '[]'::jsonb, '{}'::jsonb, null, true),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'currency',
  'Recommended One-Time Project Price', null, 4916, false, '[]'::jsonb, '{}'::jsonb, null, true),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'paragraph',
  'Final Scope', null, 4917, false, '[]'::jsonb, '{}'::jsonb, null, true),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'paragraph',
  'Exclusions (Internal Assessment)', null, 4918, false, '[]'::jsonb, '{}'::jsonb, null, true),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'paragraph',
  'Assumptions', null, 4919, false, '[]'::jsonb, '{}'::jsonb, null, true),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'paragraph',
  'MKB Assessment Notes', null, 4920, false, '[]'::jsonb, '{}'::jsonb, null, true),

(gen_random_uuid(), '283d6989-94b2-45d8-8eed-4f91702950f1', null, 'dropdown',
  'MKB Review Status', null, 4921, false,
  '[{"label":"Ready for Pricing","value":"ready_for_pricing"},{"label":"Needs Additional Information","value":"needs_additional_information"},{"label":"Needs Manual Review","value":"needs_manual_review"},{"label":"Scope Confirmed","value":"scope_confirmed"},{"label":"Ready for Proposal","value":"ready_for_proposal"}]'::jsonb,
  '{}'::jsonb, null, true);
