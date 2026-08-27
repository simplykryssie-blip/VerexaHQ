-- Follow-up to 20260827040000: a full audit of the 2026 Individual Tax
-- Organizer (both workspaces' copies) turned up several more places where a
-- gate/checkbox exists but a detail question or duplicate standalone
-- question was never actually wired to it -- so every client saw it
-- regardless of what they'd already answered. Pure show/hide fixes: no
-- fields deleted, no data loss, same conditional_logic pattern already
-- applied to the state questions and the fields exist and keep collecting
-- data whenever they do show.
--
-- 1. Dependents: "Did any dependent live somewhere other than your home for
--    part of 2026?" (EITC screening) duplicated the per-dependent
--    "Where did this person live" question already asked in the Dependents
--    repeater. Only adds information when there were no dependents to ask
--    that question about in the first place.
-- 2. Disaster/casualty/theft was asked twice (Itemized Deduction Screening,
--    then again in its own Major Life Events section) with no link between
--    them. Hides the second copy once the first is answered.
-- 3. Major Life Events checkbox has "Gave a large gift" / "Received a large
--    gift" / "Received an IRS notice" / "Received a state tax notice" /
--    "Had identity theft" options, but the Gifts, IRS/State Notices, and
--    Identity Theft sections that ask about them were never gated on it --
--    every client saw all three regardless of what they checked, unlike
--    the sibling Home Purchase/Sale, Inheritance, and Bankruptcy sections
--    which already do this correctly.

-- Summit Tax & Financial Services (organizer_template_id 76ea6903-...)
update public.organizer_fields
set conditional_logic = jsonb_build_object('show_if', jsonb_build_object('match', 'all', 'conditions', jsonb_build_array(
  jsonb_build_object('field_id', 'd69b2971-23a2-4a23-9dc8-2d4bcab57e7f', 'operator', 'not_equals', 'value', 'Yes')
)))
where id = 'c7789597-3a07-4ccb-a59e-81da746af7e8';

update public.organizer_fields
set conditional_logic = jsonb_build_object('show_if', jsonb_build_object('match', 'all', 'conditions', jsonb_build_array(
  jsonb_build_object('field_id', '5dbadce2-08df-4719-9cac-efff944416b5', 'operator', 'is_blank', 'value', '')
)))
where id in ('6f6a417b-c7be-453d-8016-d25ee86de5ce', '32a3e3be-a36c-467c-8efb-e31107477a79');

update public.organizer_fields
set conditional_logic = jsonb_build_object('show_if', jsonb_build_object('match', 'any', 'conditions', jsonb_build_array(
  jsonb_build_object('field_id', 'ff52afdc-24e9-4893-9cfa-c3306db97ece', 'operator', 'includes', 'value', 'Gave a large gift'),
  jsonb_build_object('field_id', 'ff52afdc-24e9-4893-9cfa-c3306db97ece', 'operator', 'includes', 'value', 'Received a large gift')
)))
where id = '22344717-b886-4b45-a7b7-f863e9e92ce0';

update public.organizer_fields
set conditional_logic = jsonb_build_object('show_if', jsonb_build_object('match', 'all', 'conditions', jsonb_build_array(
  jsonb_build_object('field_id', 'ff52afdc-24e9-4893-9cfa-c3306db97ece', 'operator', 'includes', 'value', 'Gave a large gift')
)))
where id = '18d62f78-3550-4f4e-a0a6-0f8b6d7a8cb4';

update public.organizer_fields
set conditional_logic = jsonb_build_object('show_if', jsonb_build_object('match', 'all', 'conditions', jsonb_build_array(
  jsonb_build_object('field_id', 'ff52afdc-24e9-4893-9cfa-c3306db97ece', 'operator', 'includes', 'value', 'Received a large gift')
)))
where id = '99af0ed4-ba17-4106-92ee-c60b49f2dba8';

update public.organizer_fields
set conditional_logic = jsonb_build_object('show_if', jsonb_build_object('match', 'any', 'conditions', jsonb_build_array(
  jsonb_build_object('field_id', 'ff52afdc-24e9-4893-9cfa-c3306db97ece', 'operator', 'includes', 'value', 'Received an IRS notice'),
  jsonb_build_object('field_id', 'ff52afdc-24e9-4893-9cfa-c3306db97ece', 'operator', 'includes', 'value', 'Received a state tax notice')
)))
where id in ('72c398d3-4466-4c93-8fca-1611a56658de', '96b447a7-07ff-4818-8632-432511b13a21');

update public.organizer_fields
set conditional_logic = jsonb_build_object('show_if', jsonb_build_object('match', 'all', 'conditions', jsonb_build_array(
  jsonb_build_object('field_id', 'ff52afdc-24e9-4893-9cfa-c3306db97ece', 'operator', 'includes', 'value', 'Had identity theft')
)))
where id in ('fb1ef0a4-85cc-4701-9eee-773583ba2ece', 'd5bd894c-a6c9-47aa-aa65-bfee9f7d4bc1');

-- MKB Financial Group LLC (organizer_template_id c03cf32b-...) -- same
-- JotForm source, same content, same fixes by field-id equivalent.
update public.organizer_fields
set conditional_logic = jsonb_build_object('show_if', jsonb_build_object('match', 'all', 'conditions', jsonb_build_array(
  jsonb_build_object('field_id', '98e7421a-723d-4fa1-98b6-3102b598d9d3', 'operator', 'not_equals', 'value', 'Yes')
)))
where id = 'd56ff382-00fa-40cc-a871-c9f3fc02b3c9';

update public.organizer_fields
set conditional_logic = jsonb_build_object('show_if', jsonb_build_object('match', 'all', 'conditions', jsonb_build_array(
  jsonb_build_object('field_id', '5b6257f3-f986-4203-a2ec-64625b2b4b1a', 'operator', 'is_blank', 'value', '')
)))
where id in ('8db3715c-77fc-4273-ba22-1a49ae0557d2', '0069c27d-623d-45bf-b677-dfe487575244');

update public.organizer_fields
set conditional_logic = jsonb_build_object('show_if', jsonb_build_object('match', 'any', 'conditions', jsonb_build_array(
  jsonb_build_object('field_id', '90702a4c-c5d6-46c0-81ad-7446e6844cb3', 'operator', 'includes', 'value', 'Gave a large gift'),
  jsonb_build_object('field_id', '90702a4c-c5d6-46c0-81ad-7446e6844cb3', 'operator', 'includes', 'value', 'Received a large gift')
)))
where id = '28816094-38d7-4b29-a328-e87b09e14ed2';

update public.organizer_fields
set conditional_logic = jsonb_build_object('show_if', jsonb_build_object('match', 'all', 'conditions', jsonb_build_array(
  jsonb_build_object('field_id', '90702a4c-c5d6-46c0-81ad-7446e6844cb3', 'operator', 'includes', 'value', 'Gave a large gift')
)))
where id = '57b2c2d0-63ae-4d82-821d-4ebf3fa6bc36';

update public.organizer_fields
set conditional_logic = jsonb_build_object('show_if', jsonb_build_object('match', 'all', 'conditions', jsonb_build_array(
  jsonb_build_object('field_id', '90702a4c-c5d6-46c0-81ad-7446e6844cb3', 'operator', 'includes', 'value', 'Received a large gift')
)))
where id = '0aace90b-85b5-48cd-b121-5df3e43facfc';

update public.organizer_fields
set conditional_logic = jsonb_build_object('show_if', jsonb_build_object('match', 'any', 'conditions', jsonb_build_array(
  jsonb_build_object('field_id', '90702a4c-c5d6-46c0-81ad-7446e6844cb3', 'operator', 'includes', 'value', 'Received an IRS notice'),
  jsonb_build_object('field_id', '90702a4c-c5d6-46c0-81ad-7446e6844cb3', 'operator', 'includes', 'value', 'Received a state tax notice')
)))
where id in ('87d573e6-6488-4b6c-8184-d36091ed8977', '6ec9ca08-f18c-4bfe-9408-4da0f87ab64b');

update public.organizer_fields
set conditional_logic = jsonb_build_object('show_if', jsonb_build_object('match', 'all', 'conditions', jsonb_build_array(
  jsonb_build_object('field_id', '90702a4c-c5d6-46c0-81ad-7446e6844cb3', 'operator', 'includes', 'value', 'Had identity theft')
)))
where id in ('afadae21-052c-4d0d-9ef9-25e060b2cf39', 'a814a9ac-093c-4bb0-b607-06f11b0f05c9');
