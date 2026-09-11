-- Systematic redundancy pass over Dependents, Income, HSA, and a section
-- naming issue, per two rules the firm owner set:
-- 1. A repeater's per-instance questions shouldn't duplicate each other or
--    something asked once elsewhere (a client with 5 employers or 5
--    dependents shouldn't answer the same fact 5 times).
-- 2. Don't make a client hand-type numbers that are already collected via
--    a document upload in the same section (W-2, 1099s, 1098, SSA-1099,
--    etc.) -- the preparer reads the actual document, not a
--    possibly-mistyped organizer answer. Keep upload fields and any
--    genuinely non-derivable qualifying questions; drop pure transcription
--    of payer/institution names and box amounts.
--
-- Caregiver, HSA-internal, and Alimony sections were also audited and came
-- back clean (each has a real reason its manual-entry fields can't be
-- replaced by an upload -- see commit message) -- no changes needed there
-- beyond the one cross-section HSA duplicate below.
--
-- All 57 deletions below were verified to exist with the expected label
-- before this migration was written, and checked against every other
-- field's conditional_logic in both templates -- none are referenced as a
-- trigger anywhere, so removing them breaks no show/hide rule.
delete from public.organizer_fields where id in (
  -- Dependents: "was there another person who may also have claimed this
  -- person" duplicates "did another person claim or intend to claim this
  -- dependent" (kept) -- same fact, asked twice per dependent.
  '9e0b196f-6e8c-440f-9028-3b01096ef337', 'fdfd4dfb-5b2c-4e74-8cb7-0ceb94f32caf',

  -- Employers repeater: per-employer state/tips/overtime dead ends,
  -- already superseded by the dedicated Tips/Overtime sections and the
  -- repeater's own work-state field.
  'df17648f-d5ce-4f66-8064-4b40bf12d0cb', '5283b593-3773-4bd6-8f0e-13e45362dc65',
  '3316441f-6954-4115-893a-90694b983ca2', 'cf55b650-a906-48e6-a472-37282ed3860d',
  '27335837-752e-4a1d-8226-9d9826dd03c3', '8465b41f-b873-495c-b69b-4c8b71d499f5',

  -- MKB-only: "Did you receive a W-2?" duplicates the very next field "Do
  -- you have the W-2?" -- Summit's copy never had this extra field.
  '0537a1ec-56ea-4b79-83e8-9a3fb35e4a9a',

  -- HSA: per-employer "Did you have HSA contributions?" duplicates the
  -- single, correctly-scoped HSA-section question -- an HSA isn't
  -- per-employer, so a client with 3 jobs was asked this 3 times.
  'e85f936e-2c59-4215-b76f-0385fe65df33', '6613369d-f9e5-447f-a1da-bf1049f80f82',

  -- Income -- upload + redundant manual transcription (rule 2):
  'ea6c6340-2edb-4152-8c72-92e0d7616426', 'db366934-bfb4-4612-ae2a-0ae181b84d93', -- Employer name (W-2)
  'ebb7f6ef-69e9-4f05-a6cb-7dd0d55d2445', 'ab79715d-311b-4555-b498-25c689f8d76a', -- EIN if available (W-2)
  'a9ed30ef-7c2d-43ac-91da-305e468ce0fb', 'd02e8086-65a0-4047-9f5a-e878ba8818b9', -- Employer (Overtime, W-2/paystub upload)
  '7336f77b-e068-4c66-b6d1-dc90d1797b67', '1bab59e1-4fab-4b3b-b7e3-2dea999f2456', -- Payer name (1099-NEC)
  '91695c49-ad6e-4279-bf9b-78e90f62b8e9', 'b2e0caad-79b7-4b70-8b3d-dd72f44aa3be', -- Total 1099-NEC income
  '8541cc2d-355b-4c1c-979f-07986a1b0f41', 'db5ab02e-c6df-4f61-b0ba-42acfeb22f53', -- Payer name (1099-MISC)
  '88ea867e-072f-4f5d-887a-90304fdb021b', '13daf674-7d48-474f-b533-bee794ac7d99', -- Total 1099-MISC income
  'c1319b2c-0e94-428c-932f-99a72cf2ea4e', 'c7cde3e9-e69f-4baa-815d-70418f4b6c20', -- Type of payment (1099-MISC, derivable from box)
  '4c98516f-5fa4-4ae8-8dc0-a84b83b744ef', 'a4650dad-223d-417d-a3ab-3e5ac795d4e8', -- Who issued it? (1099-K)
  'd59cb13a-a39e-459f-aa36-bd16b074cac3', 'b4091401-7a27-4d71-9e14-1f59f0cc13df', -- Payment platform? (1099-K, dup of "who issued it")
  '4a0e113a-f149-4dab-951f-c51f56151225', '5b12733d-c11b-455e-9592-cc0933029e95', -- Gross amount? (1099-K Box 1a)
  '14f99d75-b00c-40c0-b107-b3ace0973ce1', '660b900a-d55e-4740-bb9b-dee8137919b9', -- Bank/institution (Interest, 1099-INT upload)
  '1d18ed90-dd90-4780-9c5c-9a80a90400dc', 'b3f4d973-498c-4ee3-abb7-f2cff8b28808', -- Financial institution (Dividends, 1099-DIV upload)
  'a721894a-2443-4214-9a19-0e0a2402fa51', '1be31b8a-c785-4a39-b3b5-4d0c4154b0a4', -- Brokerage (Investments sold)
  '1dde01ea-6a59-47bd-8053-dfc8972ef878', 'eace8252-c5d6-4616-804d-933c7d9fcc4a', -- Acquisition date (on 1099-B/brokerage statement)
  '9aca7331-318c-4b42-8ed8-c410fa8c0e67', 'ec0c0a27-f013-4126-a86b-97161a052e39', -- Sale date (on 1099-B/brokerage statement)
  '88867eb1-f9ec-4fbe-9013-0911514622bd', '7afb5d57-4a1d-4985-bc66-cadfd41dc0a6', -- Institution (Retirement, 1099-R upload)
  'f77a0178-8c96-4a47-89b5-eec4431c7db1', 'a3f886fd-d7e3-423f-bd22-00e5035114e4', -- Total benefits (SSA-1099 Box 5)
  'f2e3f29b-2f56-4183-bc26-2fada18237b4', '2b5f5093-fe1c-4554-897d-22b9bfde63dc', -- Federal withholding (SSA-1099 Box 6)
  '1562410d-17c3-4687-937b-7a5152ac3090', '32f5d26b-20c2-4972-906a-b30f51a62474', -- Total unemployment compensation (1099-G Box 1)
  'f9e3d69a-b84b-4946-8988-64d095c3615c', '464e702e-2346-4436-8a89-277a89349b84', -- Federal withholding (1099-G Box 4)
  '5dbe4954-5a6d-4305-b797-d905aac6ae97', 'b76200ae-4209-4ff4-a845-8168c10fec0c', -- Royalty payer (1099 upload)
  '4725f0e3-f230-4357-b5bd-8b640944af94', '90fc4e72-2609-49ff-99d2-119ad2269c39'  -- Royalty income received (Box 2)
);

-- Dependents: custody agreement / Form 8332 only matter when there's an
-- actual claiming dispute -- scope them to that instead of every dependent.
update public.organizer_fields
set conditional_logic = '{"show_if":{"match":"any","conditions":[
  {"field_id":"915c96e4-08ea-46be-8433-06f0efa7800a","operator":"equals","value":"Yes"},
  {"field_id":"915c96e4-08ea-46be-8433-06f0efa7800a","operator":"equals","value":"Not sure"}
]}}'::jsonb
where id in ('e4def206-a6db-4e8d-bf9b-15fdc812784e', '9a0c0c6d-fd0d-46a3-9e99-995577e41d66');

update public.organizer_fields
set conditional_logic = '{"show_if":{"match":"any","conditions":[
  {"field_id":"5cbd330f-09a0-4629-bd8e-13bc3f0da442","operator":"equals","value":"Yes"},
  {"field_id":"5cbd330f-09a0-4629-bd8e-13bc3f0da442","operator":"equals","value":"Not sure"}
]}}'::jsonb
where id in ('baca874d-7523-4982-82c1-373542251ab7', 'fb40de4f-9dc6-4ce4-8415-a2e91648954b');

-- "Alimony / Legal Settlements" doesn't actually re-ask alimony questions
-- (it's a catch-all for lawsuit/settlement money that doesn't even list
-- alimony as an option) -- renamed so it stops reading as a second,
-- confusing alimony section next to the real one.
update public.organizer_fields
set label = 'Legal Settlements & Other Legal Matters'
where id in ('8907cd07-24b1-4570-b54e-8e668fafe728', 'd1e40b70-8714-4061-bf1c-ff5101660773');
