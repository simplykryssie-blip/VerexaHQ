-- Large expansion of the Dependents flow and a few Filing Status/Deductions
-- gaps, based on the firm's existing JotForm intake (no API access to
-- import it directly, so this was rebuilt field-by-field from screenshots).
-- Verified zero organizer_response_answers exist for every field touched
-- or deleted here before making any change.

-- ============================================================
-- 1. Relationship dropdown + credit help_text + reorder existing
--    dependent-repeater children into a clean 1500s block
-- ============================================================
update public.organizer_fields
set field_type = 'dropdown',
    options = '[
      {"label":"Son","value":"Son"},{"label":"Daughter","value":"Daughter"},
      {"label":"Stepson","value":"Stepson"},{"label":"Stepdaughter","value":"Stepdaughter"},
      {"label":"Foster child","value":"Foster child"},{"label":"Grandchild","value":"Grandchild"},
      {"label":"Brother","value":"Brother"},{"label":"Sister","value":"Sister"},
      {"label":"Half-brother","value":"Half-brother"},{"label":"Half-sister","value":"Half-sister"},
      {"label":"Stepbrother","value":"Stepbrother"},{"label":"Stepsister","value":"Stepsister"},
      {"label":"Niece","value":"Niece"},{"label":"Nephew","value":"Nephew"},
      {"label":"Parent","value":"Parent"},{"label":"Grandparent","value":"Grandparent"},
      {"label":"Father-in-law","value":"Father-in-law"},{"label":"Mother-in-law","value":"Mother-in-law"},
      {"label":"Son-in-law","value":"Son-in-law"},{"label":"Daughter-in-law","value":"Daughter-in-law"},
      {"label":"Brother-in-law","value":"Brother-in-law"},{"label":"Sister-in-law","value":"Sister-in-law"},
      {"label":"Aunt","value":"Aunt"},{"label":"Uncle","value":"Uncle"},{"label":"Cousin","value":"Cousin"},
      {"label":"Other","value":"Other"}
    ]'::jsonb,
    display_order = 1530
where id = '09f89530-e170-46cc-a714-fefa7e2bb914';

update public.organizer_fields
set label = 'Social Security Number or ITIN', display_order = 1520
where id = '505ae453-7080-4127-89c9-ea00960d7b98';

update public.organizer_fields set display_order = 1500 where id = 'bfff3994-2ba8-4785-9cb1-17a08ab0adea'; -- Full name
update public.organizer_fields set display_order = 1610 where id = '286597aa-e7ba-495c-82cf-1febef6f11c4'; -- Qualifies for CTC
update public.organizer_fields set display_order = 1620 where id = '55deb4f1-3698-43e0-a3be-334e71b93d92'; -- Qualifies for ODC
update public.organizer_fields set display_order = 1630 where id = '535fd6a7-fd9f-4d97-be28-f1500ecf8b99'; -- Qualifies for HOH/QSS

update public.organizer_fields
set help_text = 'Generally requires: the dependent was under age 17 at the end of the year, is your child, stepchild, foster child, sibling, half-sibling, stepsibling, or a descendant of any of them (like a grandchild, niece, or nephew), lived with you for more than half the year, didn''t provide more than half of their own support, and has a Social Security Number valid for employment. Check this if you believe they qualify -- your preparer will confirm.'
where id = '286597aa-e7ba-495c-82cf-1febef6f11c4';

update public.organizer_fields
set help_text = 'For a dependent who doesn''t meet the Child Tax Credit rules above -- for example, they''re 17 or older, or they''re a qualifying relative you support (like a parent). They still need a Social Security Number, ITIN, or ATIN. Check this if you believe they qualify -- your preparer will confirm.'
where id = '55deb4f1-3698-43e0-a3be-334e71b93d92';

-- Replaces the coarse "lived with you more than half the year" checkbox
-- with the actual number of months -- more precise, and the checkbox was
-- just a lossy version of the same fact.
delete from public.organizer_fields where id = '4135e55c-126e-4208-ab56-c58643e0d338';

-- ============================================================
-- 2. New per-dependent fields
-- ============================================================
insert into public.organizer_fields (organizer_template_id, parent_field_id, field_type, label, help_text, is_required, display_order, options, conditional_logic) values
('a9eec486-b50b-43a3-8f4d-8741f96981bb', '8935373f-2a03-4fee-9de5-a050bcc0d2df', 'date', 'Date of birth', null, true, 1510, '[]'::jsonb, '{}'::jsonb),
('a9eec486-b50b-43a3-8f4d-8741f96981bb', '8935373f-2a03-4fee-9de5-a050bcc0d2df', 'short_text', 'Their relationship to you, described', null, false, 1540, '[]'::jsonb, '{"show_if":{"match":"all","conditions":[{"field_id":"09f89530-e170-46cc-a714-fefa7e2bb914","operator":"equals","value":"Other"}]}}'::jsonb),
('a9eec486-b50b-43a3-8f4d-8741f96981bb', '8935373f-2a03-4fee-9de5-a050bcc0d2df', 'number', 'Months lived with you this year', null, true, 1550, '[]'::jsonb, '{}'::jsonb),
('a9eec486-b50b-43a3-8f4d-8741f96981bb', '8935373f-2a03-4fee-9de5-a050bcc0d2df', 'yes_no', 'College student?', null, false, 1560, '[]'::jsonb, '{}'::jsonb),
('a9eec486-b50b-43a3-8f4d-8741f96981bb', '8935373f-2a03-4fee-9de5-a050bcc0d2df', 'yes_no', 'Permanently and totally disabled?', null, false, 1570, '[]'::jsonb, '{}'::jsonb),
('a9eec486-b50b-43a3-8f4d-8741f96981bb', '8935373f-2a03-4fee-9de5-a050bcc0d2df', 'short_text', 'IP PIN (if the IRS issued them one)', null, false, 1580, '[]'::jsonb, '{}'::jsonb),
('a9eec486-b50b-43a3-8f4d-8741f96981bb', '8935373f-2a03-4fee-9de5-a050bcc0d2df', 'yes_no', 'Did you provide more than half of this dependent''s support?', null, true, 1590, '[]'::jsonb, '{}'::jsonb),
('a9eec486-b50b-43a3-8f4d-8741f96981bb', '8935373f-2a03-4fee-9de5-a050bcc0d2df', 'yes_no', 'Could anyone else claim this dependent?', null, true, 1600, '[]'::jsonb, '{}'::jsonb),
('a9eec486-b50b-43a3-8f4d-8741f96981bb', '8935373f-2a03-4fee-9de5-a050bcc0d2df', 'dropdown', 'Proof of residency type', 'Upload school, medical, or lease records showing this dependent''s name and your address below. If you don''t have it yet, skip it -- we''ll request it later.', false, 1640, '[{"label":"School record","value":"School record"},{"label":"Medical or health record","value":"Medical or health record"},{"label":"Lease or rental agreement","value":"Lease or rental agreement"},{"label":"Government benefit statement","value":"Government benefit statement"},{"label":"Other","value":"Other"}]'::jsonb, '{}'::jsonb),
('a9eec486-b50b-43a3-8f4d-8741f96981bb', '8935373f-2a03-4fee-9de5-a050bcc0d2df', 'file_upload', 'Dependent proof of residency', null, false, 1650, '[]'::jsonb, '{}'::jsonb);

-- ============================================================
-- 3. Dependent claiming acknowledgments + standalone childcare
--    provider list (top-level, right after Dependents, gated on
--    "Do you have any dependents to claim this year?" = Yes).
--    Explicit ids assigned to the gateway question and the new
--    repeating section so the repeater's show_if and its children's
--    parent_field_id can reference them within this same migration.
-- ============================================================
insert into public.organizer_fields (id, organizer_template_id, parent_field_id, field_type, label, help_text, is_required, display_order, options, conditional_logic) values
(gen_random_uuid(), 'a9eec486-b50b-43a3-8f4d-8741f96981bb', null, 'checkbox', 'I understand the IRS may require proof of residency for my dependents',
  'If you claim a dependent, the IRS may require proof of financial responsibility and where the child lived. Keep records such as medical/school records, a lease listing the child, or government benefit letters that show names and addresses.',
  true, 131, '[]'::jsonb, '{"show_if":{"match":"all","conditions":[{"field_id":"ac1d3f7a-e6b7-4799-9828-1523b647d1c3","operator":"equals","value":"Yes"}]}}'::jsonb),
(gen_random_uuid(), 'a9eec486-b50b-43a3-8f4d-8741f96981bb', null, 'checkbox', 'I understand the IRS tiebreaker rules for claiming a dependent',
  'If more than one person could claim the same child: (1) If only one of the persons is the child''s parent, the child is treated as the qualifying child of the parent. (2) If the parents don''t file a joint return together but both parents claim the child, the IRS treats the child as the qualifying child of the parent the child lived with for the longer period during the year. (3) If the child lived with each parent for the same amount of time, the IRS treats the child as the qualifying child of the parent with the higher adjusted gross income (AGI). (4) If no parent can claim the child, the child is treated as the qualifying child of the person with the highest AGI for the year. (5) If a parent can claim the child but doesn''t, the child is treated as the qualifying child of the person with the highest AGI, but only if that AGI is higher than the highest AGI of any parent who could claim the child.',
  true, 132, '[]'::jsonb, '{"show_if":{"match":"all","conditions":[{"field_id":"ac1d3f7a-e6b7-4799-9828-1523b647d1c3","operator":"equals","value":"Yes"}]}}'::jsonb),
('f0000000-0000-4000-8000-000000000133', 'a9eec486-b50b-43a3-8f4d-8741f96981bb', null, 'yes_no', 'Did you pay for childcare or dependent care so you (and your spouse, if married) could work?', null, false, 133, '[]'::jsonb, '{"show_if":{"match":"all","conditions":[{"field_id":"ac1d3f7a-e6b7-4799-9828-1523b647d1c3","operator":"equals","value":"Yes"}]}}'::jsonb),
('f0000000-0000-4000-8000-000000000134', 'a9eec486-b50b-43a3-8f4d-8741f96981bb', null, 'repeating_section', 'Child/Dependent Care Providers', null, false, 134, '[]'::jsonb, '{"show_if":{"match":"all","conditions":[{"field_id":"f0000000-0000-4000-8000-000000000133","operator":"equals","value":"yes"}]}}'::jsonb);

insert into public.organizer_fields (organizer_template_id, parent_field_id, field_type, label, help_text, is_required, display_order, options, conditional_logic) values
('a9eec486-b50b-43a3-8f4d-8741f96981bb', 'f0000000-0000-4000-8000-000000000134', 'short_text', 'Provider name', null, true, 1700, '[]'::jsonb, '{}'::jsonb),
('a9eec486-b50b-43a3-8f4d-8741f96981bb', 'f0000000-0000-4000-8000-000000000134', 'address', 'Provider address', null, true, 1710, '[]'::jsonb, '{}'::jsonb),
('a9eec486-b50b-43a3-8f4d-8741f96981bb', 'f0000000-0000-4000-8000-000000000134', 'dropdown', 'Provider ID type', null, false, 1720, '[{"label":"SSN","value":"SSN"},{"label":"EIN","value":"EIN"}]'::jsonb, '{}'::jsonb),
('a9eec486-b50b-43a3-8f4d-8741f96981bb', 'f0000000-0000-4000-8000-000000000134', 'short_text', 'ID number', null, false, 1730, '[]'::jsonb, '{}'::jsonb),
('a9eec486-b50b-43a3-8f4d-8741f96981bb', 'f0000000-0000-4000-8000-000000000134', 'short_text', 'Child''s name', null, true, 1740, '[]'::jsonb, '{}'::jsonb),
('a9eec486-b50b-43a3-8f4d-8741f96981bb', 'f0000000-0000-4000-8000-000000000134', 'currency', 'Amount paid', null, true, 1750, '[]'::jsonb, '{}'::jsonb),
('a9eec486-b50b-43a3-8f4d-8741f96981bb', 'f0000000-0000-4000-8000-000000000134', 'phone', 'Provider phone (optional)', null, false, 1760, '[]'::jsonb, '{}'::jsonb),
('a9eec486-b50b-43a3-8f4d-8741f96981bb', 'f0000000-0000-4000-8000-000000000134', 'file_upload', 'Receipt or provider statement', 'Upload a receipt or provider statement. Skip if you don''t have it yet -- we''ll request it later.', false, 1770, '[]'::jsonb, '{}'::jsonb);

-- The old flat "Child and dependent care credit" currency field asked the
-- client to state a credit amount directly -- something clients can't
-- actually compute themselves (that's the preparer's job, from the
-- provider/expense info above). Superseded by the structured provider
-- list, which gives the preparer what they actually need for Form 2441.
delete from public.organizer_fields where id = '678322b4-62f2-4dfa-b287-36e7560a55f9';

-- ============================================================
-- 4. Filing Status & Household page: missing "you are 65", reworded
--    stale spouse-age wording, and a new "life changes" question
-- ============================================================
update public.organizer_fields
set label = 'Your spouse is age 65 or older'
where id = 'dc5e6f2a-731b-4e65-967e-dc8735c6b97c';

insert into public.organizer_fields (organizer_template_id, parent_field_id, field_type, label, is_required, display_order, options, conditional_logic) values
('a9eec486-b50b-43a3-8f4d-8741f96981bb', null, 'checkbox', 'You are age 65 or older', false, 795, '[]'::jsonb, '{}'::jsonb),
('a9eec486-b50b-43a3-8f4d-8741f96981bb', null, 'multiple_choice', 'Any life changes this year?', true, 115,
  '[{"label":"Married, divorced, or legally separated","value":"Married, divorced, or legally separated"},{"label":"Had a baby or adopted","value":"Had a baby or adopted"},{"label":"Moved homes","value":"Moved homes"},{"label":"Changed jobs or started self-employment","value":"Changed jobs or started self-employment"},{"label":"Bought or sold a home","value":"Bought or sold a home"},{"label":"Received unemployment","value":"Received unemployment"},{"label":"Name changed with Social Security","value":"Name changed with Social Security"},{"label":"None of the above","value":"None of the above"}]'::jsonb,
  '{}'::jsonb);

-- ============================================================
-- 5. Education-attendance gateway, feeding into the existing
--    Education credits field alongside the generic credits question
-- ============================================================
insert into public.organizer_fields (id, organizer_template_id, parent_field_id, field_type, label, is_required, display_order, options, conditional_logic) values
('f0000000-0000-4000-8000-000000000895', 'a9eec486-b50b-43a3-8f4d-8741f96981bb', null, 'yes_no', 'Did you or your spouse attend college during the tax year?', false, 895, '[]'::jsonb, '{}'::jsonb);

update public.organizer_fields
set conditional_logic = '{"show_if":{"match":"any","conditions":[
  {"field_id":"ff1f1ca7-f4a4-4b73-8ad1-4fe3b3766d57","operator":"equals","value":"Yes"},
  {"field_id":"f0000000-0000-4000-8000-000000000895","operator":"equals","value":"yes"}
]}}'::jsonb
where id = '0bd8e48a-391b-4452-9613-59819635b1c7';
