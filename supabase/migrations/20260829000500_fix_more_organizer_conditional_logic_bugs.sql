-- Three more organizer_fields.conditional_logic bugs found while live-testing
-- Phase 3 (organizer intake) of the PTIN test plan, beyond the casing fix in
-- 20260828233000 and the dangling-reference fix in 20260828234500.

-- 1) "Head of Household Screening" (and its sibling gating fields) in the
--    "2026 Individual Tax Organizer" template use a match:"any" (OR) show_if
--    with 5 conditions. Four correctly reference the marital-status dropdown
--    (field 14c2c6d6-24d8-4705-9706-bb20b631eb84); the 5th references
--    field_id "fe4e2691-1a33-447e-957d-874eb2943d22", which doesn't exist
--    anywhere and never has (that dropdown's real options are Single/
--    Married/Legally separated/Divorced/Widowed/Other/Not sure -- no field
--    in either template offers "Head of Household" as a choice). Present
--    identically in both Summit (demo) and MKB (real customer) copies of
--    this template.
--
--    Because the parent is match:"any", this dead condition can never
--    evaluate true and so never changes behavior (the other 4 conditions
--    already carry the real logic) -- it's inert, not a live bug -- but it's
--    misleading dead weight worth removing. Written generically (matches on
--    the dangling field_id itself, not specific field/workspace ids) so it
--    cleans up every current and future copy of this template content.
update public.organizer_fields target
set conditional_logic = jsonb_set(
  target.conditional_logic,
  '{show_if,conditions}',
  (
    select jsonb_agg(cond)
    from jsonb_array_elements(target.conditional_logic->'show_if'->'conditions') as cond
    where cond->>'field_id' <> 'fe4e2691-1a33-447e-957d-874eb2943d22'
  )
)
where jsonb_typeof(target.conditional_logic->'show_if'->'conditions') = 'array'
  and exists (
    select 1 from jsonb_array_elements(target.conditional_logic->'show_if'->'conditions') as c
    where c->>'field_id' = 'fe4e2691-1a33-447e-957d-874eb2943d22'
  );

-- 2) "Did the business pay independent contractors $600 or more for
--    services?" in Summit's Business Tax Return Organizer has a match:"all"
--    show_if with a single condition referencing field_id
--    "d22ba512-5afb-46b5-87aa-17668f4e67b6", which doesn't exist -- making
--    this field permanently unreachable. Unlike the earlier Amended Return
--    case, there's no missing-section evidence pointing at a specific
--    intended gating question here -- every sibling field in this part of
--    the template (Average number of employees, Total wages paid, Did the
--    business pay interest or bank fees?) is unconditional, so the correct
--    fix is to make this field unconditional too, matching its siblings,
--    rather than inventing a new gating field.
update public.organizer_fields
set conditional_logic = '{}'::jsonb
where id = '18d4a5ee-4217-40f9-8f64-c00265ec2641';

-- 3) "Number of dependents" in Summit's "Individual Tax Return Intake --
--    Streamlined" organizer has a show_if referencing field_id
--    "775ad7c6-e7bf-4ca4-9f98-b555cbf9ddd5" (note "...b555c..."), which
--    doesn't exist -- a one-character typo of the real parent field
--    "775ad7c6-e7bf-4ca4-9f98-b555bbf9ddd5" ("...b555b...", "Did you
--    support children or other dependents?"). Two sibling fields in the
--    same template ("Did you pay childcare expenses?", "Did you or a
--    dependent attend college...") already correctly reference that same
--    real field with the correct lowercase "yes" value, confirming both the
--    intended parent and the intended value here.
update public.organizer_fields
set conditional_logic = jsonb_set(
  jsonb_set(conditional_logic, '{show_if,conditions,0,field_id}', '"775ad7c6-e7bf-4ca4-9f98-b555bbf9ddd5"'::jsonb),
  '{show_if,conditions,0,value}', '"yes"'::jsonb
)
where id = 'b4887043-669d-41ad-9561-f435cb07b2a0';
