-- Content fixes from a second round of staff testing on the 2026
-- Individual Tax Organizer (both workspaces' copies).
--
-- 1. Deletes "How do you expect to file your 2026 federal return?" --
--    asks the client to self-report an IRS filing-status category
--    directly, which the more granular data already collected (marital
--    status + the household/support questions right after it) lets the
--    preparer derive correctly instead of trusting a client's guess.
-- 2. Deletes "Are you unsure whether you qualify for EITC?" -- asks the
--    client to self-assess their own uncertainty about a credit they
--    have no way to evaluate; the field's own help_text says all it does
--    is flag an EITC review, which the preparer should just do whenever
--    the earned-income gate is met regardless.
-- 3. Deletes the mid-document "Is there anything else about your 2026
--    financial situation..." open text box -- it's an unscoped catch-all
--    duplicating the properly-positioned "Taxpayer Notes" catch-all at
--    the very end of the organizer.
-- 4. "Were you unmarried or considered unmarried on December 31, 2026?"
--    only ever showed to clients who'd already answered Widowed/Divorced/
--    Separated/Single on the marital-status question right before it --
--    i.e. people who are trivially already unmarried, making the
--    question pointless for 100% of who saw it. The real tax concept
--    ("considered unmarried" despite being legally married, for Head of
--    Household purposes) only matters for people who answered Married.
--    Rescoped it to that case and reworded it accordingly.
-- 5. The household support-test questions right after it (who else lived
--    with you, who paid expenses, outside help) need to fire for BOTH
--    groups now: people already unmarried, and married people who just
--    answered "yes" to the rescoped question above.
-- 6. "Who paid the following household expenses?" collected an itemized
--    per-expense-category breakdown (rent, utilities, food...) with who
--    paid each one -- more detail than an organizer needs. Replaced with
--    the actual IRS support test in one question: did you pay more than
--    half the cost of keeping up the home.
-- 7. "Did anyone outside your immediate household help pay your household
--    expenses?" led to an "Other contributors" repeater whose amount
--    field was just "Amount/type of contribution" (free text, no monthly
--    framing) with no total to compare it against. Reworded that field to
--    a clear monthly currency amount and added a new total-monthly-
--    household-expenses field, so a preparer can actually compute the
--    percentage.
-- 8. "Were you physically present outside the United States for any part
--    of 2026?" got a clarifying help_text -- it's about physical travel,
--    not citizenship/residency, and explains why it's asked.

-- Deletes (applies to both templates)
delete from public.organizer_fields where id in (
  'fe4e2691-1a33-447e-957d-874eb2943d22', 'ab6cbb1c-7c3a-4602-8306-106bf44ff04b', '410497b7-7755-4507-a976-04773def549b',
  'b87d411f-1ebc-4746-8fb5-a8b17659b870', '87f22b9c-d805-454c-ab87-5c9cf5daf404', '42d68c0d-f278-4754-bcad-9330bb26a469',
  '203ed6ff-72c1-48f1-92fc-509c7e516b7e', '7c3a42af-3933-4f64-9215-de956a185993', 'f3039af3-f306-4371-a5a4-406a364ee01e',
  '2beac35e-4e2e-4f3e-8131-20a7a15d90b1', '96a32600-4d22-4cd8-a853-597a669244f5', '7266cbf1-7ee7-4d5c-837a-5a5b85f032f3'
);

-- Summit Tax & Financial Services (76ea6903)
update public.organizer_fields
set label = 'Even though you were married, did you live apart from your spouse for the last half of 2026?',
    help_text = 'This can affect whether you''re treated as unmarried for Head of Household purposes.',
    conditional_logic = '{"show_if":{"match":"all","conditions":[{"field_id":"14c2c6d6-24d8-4705-9706-bb20b631eb84","operator":"equals","value":"Married"}]}}'::jsonb
where id = 'fbae1f9a-725b-41c4-9f61-bc19b84b4883';

update public.organizer_fields
set conditional_logic = '{"show_if":{"match":"any","conditions":[
  {"field_id":"14c2c6d6-24d8-4705-9706-bb20b631eb84","operator":"equals","value":"Widowed"},
  {"field_id":"14c2c6d6-24d8-4705-9706-bb20b631eb84","operator":"equals","value":"Legally separated"},
  {"field_id":"14c2c6d6-24d8-4705-9706-bb20b631eb84","operator":"equals","value":"Divorced"},
  {"field_id":"14c2c6d6-24d8-4705-9706-bb20b631eb84","operator":"equals","value":"Single"},
  {"field_id":"fbae1f9a-725b-41c4-9f61-bc19b84b4883","operator":"equals","value":"Yes"}
]}}'::jsonb
where id in ('f90cf7a9-783e-4e5e-8c63-1861e8875d11', 'c5289dcf-d566-4e5a-9fb9-e22d134388ff', '1e16b2c4-1292-496c-8c9f-4517b0f056de');

update public.organizer_fields
set field_type = 'yes_no', label = 'Did you pay more than half the cost of keeping up your home during 2026?', options = '[]'
where id = 'c5289dcf-d566-4e5a-9fb9-e22d134388ff';

update public.organizer_fields
set field_type = 'currency', label = 'How much did they contribute per month?'
where id = '05d21779-4360-4c58-8bf9-a5fec092b76b';

update public.organizer_fields
set help_text = 'This means physical travel outside the U.S. -- even a short trip counts. We ask because time abroad can affect certain tax rules, like the Foreign Earned Income Exclusion or filing requirements.'
where id = 'e0eeeb78-2dbc-498e-a465-b33e256d2c06';

-- MKB Financial Group LLC (c03cf32b) -- same content, same fixes.
update public.organizer_fields
set label = 'Even though you were married, did you live apart from your spouse for the last half of 2026?',
    help_text = 'This can affect whether you''re treated as unmarried for Head of Household purposes.',
    conditional_logic = '{"show_if":{"match":"all","conditions":[{"field_id":"187aa3ad-5051-4414-8e40-82651b9bb9ef","operator":"equals","value":"Married"}]}}'::jsonb
where id = '3a0258d0-ab26-419a-8b22-7645acca2a0c';

update public.organizer_fields
set conditional_logic = '{"show_if":{"match":"any","conditions":[
  {"field_id":"187aa3ad-5051-4414-8e40-82651b9bb9ef","operator":"equals","value":"Widowed"},
  {"field_id":"187aa3ad-5051-4414-8e40-82651b9bb9ef","operator":"equals","value":"Legally separated"},
  {"field_id":"187aa3ad-5051-4414-8e40-82651b9bb9ef","operator":"equals","value":"Divorced"},
  {"field_id":"187aa3ad-5051-4414-8e40-82651b9bb9ef","operator":"equals","value":"Single"},
  {"field_id":"3a0258d0-ab26-419a-8b22-7645acca2a0c","operator":"equals","value":"Yes"}
]}}'::jsonb
where id in ('6d438917-89d0-4efc-8604-21bcfb162577', 'fb953e63-33d5-4b5f-85c0-baff86314441', 'd4c0b4db-4115-47b2-b520-da90b0e58092');

update public.organizer_fields
set field_type = 'yes_no', label = 'Did you pay more than half the cost of keeping up your home during 2026?', options = '[]'
where id = 'fb953e63-33d5-4b5f-85c0-baff86314441';

update public.organizer_fields
set field_type = 'currency', label = 'How much did they contribute per month?'
where id = 'd6094dea-d2cb-4c9a-bc01-548ae9fed837';

update public.organizer_fields
set help_text = 'This means physical travel outside the U.S. -- even a short trip counts. We ask because time abroad can affect certain tax rules, like the Foreign Earned Income Exclusion or filing requirements.'
where id = 'd472c16d-c9eb-4fb8-b85a-d043478b3a17';

-- Insert a total-monthly-household-expenses field ahead of "Other
-- contributors" (display_order 77 in both templates) so a preparer has
-- something to compare the outside contributor's monthly amount against.
-- Two-phase shift (via a large temporary offset) avoids any transient
-- unique-constraint collision from shifting a contiguous range by a
-- constant within one statement.
update public.organizer_fields set display_order = display_order + 10000
where organizer_template_id = '76ea6903-fb2d-4cc9-b428-7dddedc2b785' and display_order >= 77;
update public.organizer_fields set display_order = display_order - 9999
where organizer_template_id = '76ea6903-fb2d-4cc9-b428-7dddedc2b785' and display_order >= 10077;

insert into public.organizer_fields (organizer_template_id, field_type, label, display_order, is_required, options, conditional_logic) values
('76ea6903-fb2d-4cc9-b428-7dddedc2b785', 'currency', 'What are your total household expenses per month (rent/mortgage, utilities, groceries, etc.)?', 77, false, '[]',
 '{"show_if":{"match":"all","conditions":[{"field_id":"1e16b2c4-1292-496c-8c9f-4517b0f056de","operator":"equals","value":"yes"}]}}'::jsonb);

update public.organizer_fields set display_order = display_order + 10000
where organizer_template_id = 'c03cf32b-928d-463f-b850-4e75d7fcca2e' and display_order >= 77;
update public.organizer_fields set display_order = display_order - 9999
where organizer_template_id = 'c03cf32b-928d-463f-b850-4e75d7fcca2e' and display_order >= 10077;

insert into public.organizer_fields (organizer_template_id, field_type, label, display_order, is_required, options, conditional_logic) values
('c03cf32b-928d-463f-b850-4e75d7fcca2e', 'currency', 'What are your total household expenses per month (rent/mortgage, utilities, groceries, etc.)?', 77, false, '[]',
 '{"show_if":{"match":"all","conditions":[{"field_id":"d4c0b4db-4115-47b2-b520-da90b0e58092","operator":"equals","value":"yes"}]}}'::jsonb);
