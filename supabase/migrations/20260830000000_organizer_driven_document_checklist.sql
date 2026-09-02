-- Lets an "upload a file" organizer question opt into the document
-- checklist instead of someone building that list by hand. When a client
-- submits the organizer, /api/documents/sync-organizer-document-checklist
-- walks every opted-in upload question that was actually shown to the
-- client (skipping ones hidden by conditional logic) and files a checklist
-- item: already-uploaded ones come in pre-checked and linked to the real
-- file, missing ones come in as open items for the VA to chase.

-- 1. Per-field opt-in + display metadata. document_checklist_name lets the
--    checklist show a short name ("W-2") instead of the verbose on-form
--    prompt ("Upload your 2026 W-2 (if you have it)"); falls back to the
--    field's own label when left blank.
alter table public.organizer_fields
  add column include_in_document_checklist boolean not null default false,
  add column document_checklist_name text,
  add column document_checklist_category text;

-- 2. Trace each auto-created checklist item back to the organizer field it
--    came from, so the organizer review screen can point at it (and so
--    re-syncing after an edited/resubmitted organizer updates the same row
--    instead of creating a duplicate).
alter table public.document_request_item_statuses
  add column organizer_field_id uuid references public.organizer_fields(id) on delete set null;

create index document_request_item_statuses_organizer_field_id_idx
  on public.document_request_item_statuses (organizer_field_id)
  where organizer_field_id is not null;

-- 3. One auto-created document_requests row per organizer response, so the
--    sync endpoint can find-and-update it instead of creating a new request
--    every time (e.g. a corrected/resubmitted organizer).
alter table public.document_requests
  add column organizer_response_id uuid references public.organizer_responses(id) on delete cascade;

create unique index document_requests_organizer_response_id_key
  on public.document_requests (organizer_response_id)
  where organizer_response_id is not null;

-- 4. Starting set: opt in the 15 upload questions on MKB's live Individual
--    organizer that already match the static checklist built earlier, so
--    Kryssie isn't starting from a blank slate. She can add/remove more
--    from the builder.
update public.organizer_fields as f
set include_in_document_checklist = true,
    document_checklist_name = v.name,
    document_checklist_category = v.category
from (values
  ('f7467f04-15f4-4abe-9fc4-1aed4bd3b8bd'::uuid, 'W-2', 'Income'),
  ('aa60f31d-2f29-4f8f-b174-2334f73fd061'::uuid, 'Form 1099-NEC', 'Income'),
  ('5617a64d-4d15-429d-ad5d-c2984a771719'::uuid, 'Form 1099-MISC', 'Income'),
  ('464a97a0-00ad-4917-bc52-bc712b492324'::uuid, 'Form 1099-K', 'Income'),
  ('b445c016-949e-4936-a0d4-ba56f3b5edc1'::uuid, 'Form 1099-INT', 'Investments'),
  ('33f7deb0-fb54-4f25-85d6-1f1d1cd67cf1'::uuid, 'Form 1099-DIV', 'Investments'),
  ('417865e2-b237-4207-a3bc-998631ac0d3e'::uuid, 'Form 1099-B / Brokerage Statement', 'Investments'),
  ('8bd0793e-1016-435d-833f-9b898bb85347'::uuid, 'Digital Asset Transaction History', 'Investments'),
  ('fc385858-ef70-43d4-92b7-4b6b2a9dad0a'::uuid, 'Form 1099-R', 'Retirement & Benefits'),
  ('e86d58b7-f054-4db1-9f1f-f1ccc755d886'::uuid, 'SSA-1099', 'Retirement & Benefits'),
  ('ff49c801-e96d-4353-8e8c-19a7520086f3'::uuid, 'Form 1099-G', 'Retirement & Benefits'),
  ('c76e7b99-5454-4578-8633-99aa52d796e5'::uuid, 'W-2G / Gambling Records', 'Income'),
  ('1984605b-8334-4288-b756-cf96b30216fd'::uuid, 'Schedule K-1', 'Income'),
  ('ae7d2346-c4bb-4068-ba58-0c56e34a7d97'::uuid, '1099 for Royalties', 'Income'),
  ('b2d982eb-f29e-49a2-8b3e-656f13b66c7c'::uuid, 'Childcare Provider Documentation', 'Credits & Deductions')
) as v(id, name, category)
where f.id = v.id;

-- 5. Unlink the static per-service checklist template from Individual Tax
--    Prep -- the organizer-driven checklist above supersedes it, and
--    leaving both linked would fire two separate document requests for the
--    same client. The template itself is left in place, just unlinked.
update public.services
set document_request_template_id = null
where id = '2ff9adce-8a62-4c39-acf5-f3e8e9f8ec68';
