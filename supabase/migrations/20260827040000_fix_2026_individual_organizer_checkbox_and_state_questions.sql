-- Summit Tax & Financial Services' "2026 Individual Tax Organizer" (imported
-- from JotForm) has two content problems reported by staff:
--
-- 1. The tax-year confirmation field is field_type='checkbox' with BOTH a
--    field label ("Confirm this organizer is for tax year 2026") and a
--    single option with nearly the same text. Checkbox fields render only
--    the option text as the clickable row (see FieldPropertiesPanel.tsx's
--    own note: "Add each checkbox's text below -- no separate question
--    label needed") -- the bold header above it is inert. Clients clicking
--    that header see nothing happen, which reads as "the box won't check."
--    Clearing the redundant label fixes it: only the one clickable row
--    shows.
--
-- 2. "Did you work in a state different from where you lived?" / "...earn
--    income from another state?" / "...maintain a home in another state?"
--    always showed, duplicating the per-state work/home questions already
--    asked inside the "States lived in during 2026" repeater whenever
--    someone lived in more than one state. They only add information when
--    someone lived in ONE state all year (e.g. lived in NJ, commuted to
--    work in NYC) -- the one case the repeater never covers. Scoped to
--    show only then, and reworded now that they no longer sit next to the
--    repeater for context.
update public.organizer_fields
set label = ''
where id = '57e4ec63-d44c-4963-8e21-61279e3b8bf4';

update public.organizer_fields
set label = 'Did you work in a different state than the one you lived in during 2026?',
    conditional_logic = jsonb_build_object(
      'show_if', jsonb_build_object(
        'match', 'all',
        'conditions', jsonb_build_array(
          jsonb_build_object('field_id', '7ff33750-9e9f-45a0-8500-ed8a07b7945a', 'operator', 'not_equals', 'value', 'Yes')
        )
      )
    )
where id = '3dd3d3b1-3ea0-4391-94b0-232c53bd667d';

update public.organizer_fields
set label = 'Did you earn any income (wages, rental, freelance, or other) from a state other than where you lived?',
    conditional_logic = jsonb_build_object(
      'show_if', jsonb_build_object(
        'match', 'all',
        'conditions', jsonb_build_array(
          jsonb_build_object('field_id', '7ff33750-9e9f-45a0-8500-ed8a07b7945a', 'operator', 'not_equals', 'value', 'Yes')
        )
      )
    )
where id = '51bacb1d-4482-4062-83e1-b500650c6ab4';

update public.organizer_fields
set label = 'Did you own or rent a home in a state other than where you lived, at any point during 2026?',
    conditional_logic = jsonb_build_object(
      'show_if', jsonb_build_object(
        'match', 'all',
        'conditions', jsonb_build_array(
          jsonb_build_object('field_id', '7ff33750-9e9f-45a0-8500-ed8a07b7945a', 'operator', 'not_equals', 'value', 'Yes')
        )
      )
    )
where id = 'f02b2c8d-d4a3-490b-a1cd-e4c99407e92c';

-- MKB Financial Group LLC's copy of the same organizer (same JotForm source,
-- same import artifact, different workspace) -- identical fix.
update public.organizer_fields
set label = ''
where id = '7bf2cc19-455f-4bef-8f90-2aceaa7d65ea';

update public.organizer_fields
set label = 'Did you work in a different state than the one you lived in during 2026?',
    conditional_logic = jsonb_build_object(
      'show_if', jsonb_build_object(
        'match', 'all',
        'conditions', jsonb_build_array(
          jsonb_build_object('field_id', 'b9716ab8-057f-47db-830f-4e88fcce7e05', 'operator', 'not_equals', 'value', 'Yes')
        )
      )
    )
where id = '008e10d6-16a9-4397-ac99-64ba7703fda3';

update public.organizer_fields
set label = 'Did you earn any income (wages, rental, freelance, or other) from a state other than where you lived?',
    conditional_logic = jsonb_build_object(
      'show_if', jsonb_build_object(
        'match', 'all',
        'conditions', jsonb_build_array(
          jsonb_build_object('field_id', 'b9716ab8-057f-47db-830f-4e88fcce7e05', 'operator', 'not_equals', 'value', 'Yes')
        )
      )
    )
where id = 'd5182757-b60a-4509-97d0-bb133ab30f60';

update public.organizer_fields
set label = 'Did you own or rent a home in a state other than where you lived, at any point during 2026?',
    conditional_logic = jsonb_build_object(
      'show_if', jsonb_build_object(
        'match', 'all',
        'conditions', jsonb_build_array(
          jsonb_build_object('field_id', 'b9716ab8-057f-47db-830f-4e88fcce7e05', 'operator', 'not_equals', 'value', 'Yes')
        )
      )
    )
where id = 'e26678e3-dbfb-4947-b7eb-31aa8bb99a46';
