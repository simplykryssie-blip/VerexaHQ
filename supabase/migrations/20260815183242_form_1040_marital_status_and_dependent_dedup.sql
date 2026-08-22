-- Form 1040 fixes: replace the tax-jargon "filing status" self-select with
-- a plain marital-status question (matching every other question on this
-- organizer, which was rebuilt to never require the client to already know
-- tax terminology), and remove two redundant/broken questions.
--
-- Verified zero organizer_response_answers exist for any field touched
-- here before making this change -- nothing is lost.

-- 1. "What's your filing status?" (Single/MFJ/MFS/HOH/QSS -- the actual
--    IRS filing status is a preparer determination, not something to ask a
--    client to self-diagnose) becomes "What's your marital status?" --
--    plain terms a client actually knows about themselves. Same field id,
--    same position, since nothing has answered it yet.
update public.organizer_fields
set label = 'What''s your marital status?',
    options = '[{"label":"Married","value":"Married"},{"label":"Single","value":"Single"},{"label":"Separated","value":"Separated"},{"label":"Divorced","value":"Divorced"},{"label":"Widowed","value":"Widowed"}]'::jsonb
where id = 'b12fccdc-4d0c-496f-a511-e158ba5ecee5';

-- 2. "Spouse's full name" was shown for MFJ/MFS/QSS -- now shown for
--    Married, Separated, or Widowed (a surviving spouse still needs to
--    name the deceased spouse for the return).
update public.organizer_fields
set conditional_logic = '{"show_if":{"match":"any","conditions":[
  {"field_id":"b12fccdc-4d0c-496f-a511-e158ba5ecee5","operator":"equals","value":"Married"},
  {"field_id":"b12fccdc-4d0c-496f-a511-e158ba5ecee5","operator":"equals","value":"Separated"},
  {"field_id":"b12fccdc-4d0c-496f-a511-e158ba5ecee5","operator":"equals","value":"Widowed"}
]}}'::jsonb
where id = '9cff8b5c-fdb7-44fe-92bf-fe939bd9e237';

-- 3. "You and your spouse lived apart for the last 6 months of the year,
--    or you're legally separated" was shown for MFS/HOH -- now driven by
--    the new marital-status question directly: only Married or Separated
--    clients can answer "yes" to this (Single/Divorced/Widowed can't have
--    lived apart from a spouse they don't have).
update public.organizer_fields
set conditional_logic = '{"show_if":{"match":"any","conditions":[
  {"field_id":"b12fccdc-4d0c-496f-a511-e158ba5ecee5","operator":"equals","value":"Married"},
  {"field_id":"b12fccdc-4d0c-496f-a511-e158ba5ecee5","operator":"equals","value":"Separated"}
]}}'::jsonb
where id = 'cd175f19-550d-46d1-b1f5-46037e997cde';

-- 4. Three fields that only make sense on a joint return (spouse's age/
--    blindness for the standard deduction addl. amount, spouse claimable
--    as someone else's dependent) were gated on filing_status = MFJ --
--    now gated on marital_status = Married, same restriction, new field.
update public.organizer_fields
set conditional_logic = '{"show_if":{"match":"all","conditions":[
  {"field_id":"b12fccdc-4d0c-496f-a511-e158ba5ecee5","operator":"equals","value":"Married"}
]}}'::jsonb
where id in ('72673561-c154-4aba-8f2c-1820f1582217', 'ef13d354-a66f-4650-8245-57e36a37a5e5', 'dc5e6f2a-731b-4e65-967e-dc8735c6b97c');

-- 5. "If you have a qualifying child for head of household or surviving
--    spouse status, their name" duplicated the Dependents section right
--    below it, which already collects every dependent's name -- delete
--    the standalone question and instead add a checkbox to each dependent
--    row (same unconditional pattern as the existing CTC/ODC checkboxes
--    on that repeating section) so "which dependent, if any, supports
--    HOH/QSS" is captured as part of the dependent record itself, not a
--    separate disconnected text field.
delete from public.organizer_fields where id = '64cec5df-d71a-467a-bd2f-1ccb9a150a00';

insert into public.organizer_fields (organizer_template_id, parent_field_id, field_type, label, is_required, display_order)
values (
  'a9eec486-b50b-43a3-8f4d-8741f96981bb',
  '8935373f-2a03-4fee-9de5-a050bcc0d2df',
  'checkbox',
  'Qualifies you for Head of Household or Surviving Spouse filing status',
  false,
  1420
);

-- 6. "Married filing separately and lived apart from your spouse for all
--    of the tax year" (in Adjustments & Deductions, for the IRA deduction
--    phase-out test) was wired to show whenever "IRA contributions you'd
--    like to deduct" had ANY answer at all -- not tied to marital status
--    or MFS in any way, so it would surface for a jointly-filing client
--    with zero connection to the question it's asking. It's also asking
--    the same underlying fact ("did you live apart from your spouse")
--    already captured by field 3 above, just for a different worksheet.
--    Rather than ask the client the same thing twice, delete this one --
--    the preparer already has the "lived apart" answer on file when
--    working the IRA deduction phase-out.
delete from public.organizer_fields where id = 'a4e5ee09-eafe-4db0-85a8-a98343a6f6ab';
