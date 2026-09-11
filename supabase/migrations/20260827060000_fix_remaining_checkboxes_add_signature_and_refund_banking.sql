-- Three more real problems reported after testing the 2026 Individual Tax
-- Organizer end to end:
--
-- 1. The same "redundant label makes the checkbox look unclickable" bug
--    (fixed once already for the tax-year confirmation) turned out to
--    affect 5 more single-option checkboxes in Summit's copy and 1 more in
--    MKB's copy -- including the 3 final consent checkboxes, which are all
--    is_required=true. Since they could never actually be checked, the
--    client could never satisfy Submit's required-field check either --
--    this is also the root cause of "I can't submit organizer."
-- 2. saveAll() in components/portal/OrganizerForm.tsx had no try/finally,
--    so an unexpected throw (not a clean Supabase .error) left `saving`
--    stuck true forever with no toast -- "Save just spins, no confirmation
--    or rejection." Fixed in code (see saveAll()/submit() in that file).
-- 3. The organizer never collected refund direct-deposit banking info or a
--    client signature at all. Adds both: a conditional refund/banking
--    section before Client Certification, and a required signature field
--    at the very end.

-- Part 1: clear the redundant labels on the remaining broken checkboxes.
update public.organizer_fields
set label = ''
where id in (
  '68fd464b-cba1-4c54-98fe-84c7310e0bcd', -- Summit 841 "Please confirm before continuing:"
  '523d215f-f2ae-4e59-9b71-5f7ddcfc53e7', -- Summit 842 "Records currently available"
  '85d103a1-cc14-4e94-b349-1824eceb3d77', -- Summit 843 "Additional information acknowledgement"
  'ad3d1a0c-aeca-43f9-ad2e-479b4b66336d', -- Summit 870 "Client certification of information"
  '793ca56d-c514-4885-aa6e-88b5d38de162', -- Summit 871 "Additional information may be requested"
  'f8f90658-768f-4717-b703-47edaabf88f3', -- Summit 872 "Organizer is not a filed tax return"
  'ae157604-e110-43f1-a1bf-8cdc4b10fcc7'  -- MKB 839 "Please confirm before continuing:"
);

-- Part 2: Summit Tax & Financial Services -- make room for the new Refund &
-- Direct Deposit section (7 rows) ahead of Client Certification (currently
-- display_order 869-872), then insert it, then append the signature field.
update public.organizer_fields
set display_order = display_order + 7
where organizer_template_id = '76ea6903-fb2d-4cc9-b428-7dddedc2b785'
  and display_order >= 869;

insert into public.organizer_fields (organizer_template_id, field_type, label, help_text, display_order, is_required, options, conditional_logic) values
('76ea6903-fb2d-4cc9-b428-7dddedc2b785', 'section', 'Refund & Direct Deposit', null, 869, false, '[]', '{}'),
('76ea6903-fb2d-4cc9-b428-7dddedc2b785', 'yes_no', 'Would you like your federal refund (if any) deposited directly into your bank account?', null, 870, false, '[]', '{}'),
('76ea6903-fb2d-4cc9-b428-7dddedc2b785', 'radio_button', 'Account type', null, 871, true, '[{"label":"Checking","value":"Checking"},{"label":"Savings","value":"Savings"}]', '{"show_if":{"match":"all","conditions":[{"field_id":"__GATE_SUMMIT__","operator":"equals","value":"yes"}]}}'),
('76ea6903-fb2d-4cc9-b428-7dddedc2b785', 'short_text', 'Bank name', null, 872, true, '[]', '{"show_if":{"match":"all","conditions":[{"field_id":"__GATE_SUMMIT__","operator":"equals","value":"yes"}]}}'),
('76ea6903-fb2d-4cc9-b428-7dddedc2b785', 'short_text', 'Routing number', 'The 9-digit number on the bottom left of a check.', 873, true, '[]', '{"show_if":{"match":"all","conditions":[{"field_id":"__GATE_SUMMIT__","operator":"equals","value":"yes"}]}}'),
('76ea6903-fb2d-4cc9-b428-7dddedc2b785', 'short_text', 'Account number', null, 874, true, '[]', '{"show_if":{"match":"all","conditions":[{"field_id":"__GATE_SUMMIT__","operator":"equals","value":"yes"}]}}'),
('76ea6903-fb2d-4cc9-b428-7dddedc2b785', 'short_text', 'Confirm account number', 'Re-enter to confirm -- an incorrect account number can send your refund to the wrong account.', 875, true, '[]', '{"show_if":{"match":"all","conditions":[{"field_id":"__GATE_SUMMIT__","operator":"equals","value":"yes"}]}}');

insert into public.organizer_fields (organizer_template_id, field_type, label, help_text, display_order, is_required, options) values
('76ea6903-fb2d-4cc9-b428-7dddedc2b785', 'signature', 'Your signature', 'By signing, you confirm the certifications above.', 880, true, '[]');

-- MKB Financial Group LLC -- same shape, before its Client Certification
-- section (currently display_order 867-870).
update public.organizer_fields
set display_order = display_order + 7
where organizer_template_id = 'c03cf32b-928d-463f-b850-4e75d7fcca2e'
  and display_order >= 867;

insert into public.organizer_fields (organizer_template_id, field_type, label, help_text, display_order, is_required, options, conditional_logic) values
('c03cf32b-928d-463f-b850-4e75d7fcca2e', 'section', 'Refund & Direct Deposit', null, 867, false, '[]', '{}'),
('c03cf32b-928d-463f-b850-4e75d7fcca2e', 'yes_no', 'Would you like your federal refund (if any) deposited directly into your bank account?', null, 868, false, '[]', '{}'),
('c03cf32b-928d-463f-b850-4e75d7fcca2e', 'radio_button', 'Account type', null, 869, true, '[{"label":"Checking","value":"Checking"},{"label":"Savings","value":"Savings"}]', '{"show_if":{"match":"all","conditions":[{"field_id":"__GATE_MKB__","operator":"equals","value":"yes"}]}}'),
('c03cf32b-928d-463f-b850-4e75d7fcca2e', 'short_text', 'Bank name', null, 870, true, '[]', '{"show_if":{"match":"all","conditions":[{"field_id":"__GATE_MKB__","operator":"equals","value":"yes"}]}}'),
('c03cf32b-928d-463f-b850-4e75d7fcca2e', 'short_text', 'Routing number', 'The 9-digit number on the bottom left of a check.', 871, true, '[]', '{"show_if":{"match":"all","conditions":[{"field_id":"__GATE_MKB__","operator":"equals","value":"yes"}]}}'),
('c03cf32b-928d-463f-b850-4e75d7fcca2e', 'short_text', 'Account number', null, 872, true, '[]', '{"show_if":{"match":"all","conditions":[{"field_id":"__GATE_MKB__","operator":"equals","value":"yes"}]}}'),
('c03cf32b-928d-463f-b850-4e75d7fcca2e', 'short_text', 'Confirm account number', 'Re-enter to confirm -- an incorrect account number can send your refund to the wrong account.', 873, true, '[]', '{"show_if":{"match":"all","conditions":[{"field_id":"__GATE_MKB__","operator":"equals","value":"yes"}]}}');

insert into public.organizer_fields (organizer_template_id, field_type, label, help_text, display_order, is_required, options) values
('c03cf32b-928d-463f-b850-4e75d7fcca2e', 'signature', 'Your signature', 'By signing, you confirm the certifications above.', 878, true, '[]');

-- Backfill the real gate field ids now that the yes_no rows above exist,
-- replacing the placeholder ids used in the inserts (Postgres has no way to
-- reference a just-inserted sibling row's generated id inline in the same
-- multi-row insert without a WITH/RETURNING chain).
update public.organizer_fields f
set conditional_logic = jsonb_set(f.conditional_logic, '{show_if,conditions,0,field_id}', to_jsonb(g.id::text))
from public.organizer_fields g
where f.organizer_template_id = '76ea6903-fb2d-4cc9-b428-7dddedc2b785'
  and g.organizer_template_id = '76ea6903-fb2d-4cc9-b428-7dddedc2b785'
  and g.display_order = 870 and g.field_type = 'yes_no'
  and f.display_order between 871 and 875;

update public.organizer_fields f
set conditional_logic = jsonb_set(f.conditional_logic, '{show_if,conditions,0,field_id}', to_jsonb(g.id::text))
from public.organizer_fields g
where f.organizer_template_id = 'c03cf32b-928d-463f-b850-4e75d7fcca2e'
  and g.organizer_template_id = 'c03cf32b-928d-463f-b850-4e75d7fcca2e'
  and g.display_order = 868 and g.field_type = 'yes_no'
  and f.display_order between 869 and 873;
