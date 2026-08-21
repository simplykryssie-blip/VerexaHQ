-- Adds real spouse/dependent capture to the Verexa HQ CRM "Individual Tax
-- Return Organizer" (previously just a yes/no + a count, with nothing for
-- the platform to actually read). Spouse fields show only when filing
-- status is Married Filing Jointly/Separately; the Dependents repeating
-- section shows only when the dependents yes/no is answered "yes" -- one
-- client_relationships row gets created per repeat automatically on
-- submission (see sync_client_relationships_from_organizer_submission(),
-- 20260817164457). Field-type + relationship_role choices, and the
-- dependent-relationship option list, mirror the working Form 1040 template
-- (organizer_fields ids 85e67552.../2c76f7c9.../a22f9885...).
--
-- organizer_fields has a unique (organizer_template_id, display_order)
-- constraint checked per-statement, so existing rows that need to move into
-- the new numbering are bumped into a temporary high range first, then
-- brought back down to their final slot once the new rows have claimed
-- theirs -- avoids any mid-migration collision.
do $$
declare
  v_template_id uuid;
  v_filing_status_id uuid := 'c1bc4024-a8d8-4d5a-aa73-54d476756c90';
  v_has_dependents_id uuid := '570e6c05-060d-459b-8d1d-7db3b7b03cfc';
  v_repeater_id uuid := gen_random_uuid();
begin
  select organizer_template_id into v_template_id from public.organizer_fields where id = v_filing_status_id;

  -- The "how many dependents" count is redundant once the repeating
  -- section below lets them add one row per dependent.
  delete from public.organizer_fields where id = '2a43a78a-7cb9-4864-8748-8226a46cd1d9';

  -- Phase 1: park everything from "Do you have any dependents?" onward in a
  -- temporary range so 2..8 are free for the new spouse/dependent fields.
  update public.organizer_fields set display_order = display_order + 1000
  where organizer_template_id = v_template_id and display_order >= 2;

  insert into public.organizer_fields (organizer_template_id, field_type, label, display_order, is_required, options, relationship_role, conditional_logic) values
  (v_template_id, 'name', 'Spouse''s full name', 2, false, '[]', 'spouse_full_name',
    jsonb_build_object('show_if', jsonb_build_object('match', 'any', 'conditions', jsonb_build_array(
      jsonb_build_object('field_id', v_filing_status_id, 'operator', 'equals', 'value', 'Married Filing Jointly'),
      jsonb_build_object('field_id', v_filing_status_id, 'operator', 'equals', 'value', 'Married Filing Separately')
    )))),
  (v_template_id, 'date', 'Spouse''s date of birth', 3, false, '[]', 'spouse_dob',
    jsonb_build_object('show_if', jsonb_build_object('match', 'any', 'conditions', jsonb_build_array(
      jsonb_build_object('field_id', v_filing_status_id, 'operator', 'equals', 'value', 'Married Filing Jointly'),
      jsonb_build_object('field_id', v_filing_status_id, 'operator', 'equals', 'value', 'Married Filing Separately')
    ))));

  insert into public.organizer_fields (id, organizer_template_id, field_type, label, display_order, is_required, options, conditional_logic) values
  (v_repeater_id, v_template_id, 'repeating_section', 'Dependents', 5, false, '[]',
    jsonb_build_object('show_if', jsonb_build_object('match', 'all', 'conditions', jsonb_build_array(
      jsonb_build_object('field_id', v_has_dependents_id, 'operator', 'equals', 'value', 'yes')
    ))));

  insert into public.organizer_fields (organizer_template_id, parent_field_id, field_type, label, display_order, is_required, options, relationship_role) values
  (v_template_id, v_repeater_id, 'name', 'Full name', 6, true, '[]', 'dependent_full_name'),
  (v_template_id, v_repeater_id, 'date', 'Date of birth', 7, true, '[]', 'dependent_dob'),
  (v_template_id, v_repeater_id, 'dropdown', 'Relationship to you', 8, true,
    '[{"label":"Son","value":"Son"},{"label":"Daughter","value":"Daughter"},{"label":"Stepchild","value":"Stepchild"},{"label":"Foster child","value":"Foster child"},{"label":"Grandchild","value":"Grandchild"},{"label":"Sibling","value":"Sibling"},{"label":"Parent","value":"Parent"},{"label":"Other relative","value":"Other relative"},{"label":"Other","value":"Other"}]',
    'dependent_relationship_type');

  -- Phase 2: bring the parked rows back down to their final slots (9..12),
  -- one at a time so each lands on a target no longer occupied.
  update public.organizer_fields set display_order = 4 where id = v_has_dependents_id;
  update public.organizer_fields set display_order = 9 where id = '4f525281-7e11-45de-8e02-7201edf1abca';
  update public.organizer_fields set display_order = 10 where id = 'd4fed49a-c9fd-4e4c-b666-bf81b7bc4e0e';
  update public.organizer_fields set display_order = 11 where id = '0710c081-d5e4-47e5-92c8-f0ade82001bb';
  update public.organizer_fields set display_order = 12 where id = 'c8ab5b70-1870-49bd-b9d6-b424e3388fd9';
end $$;
