-- Phase 7 (documents & IRS notices): document_request_templates was fully
-- built on the backend (schema, 7 RPCs, 3 triggers, partial-fulfillment
-- carryover, folder auto-filing on upload) but had zero rows anywhere in the
-- database and no builder UI anywhere in the app -- staff have never had a
-- way to create one, so the "New document request" panel and the Workflows
-- "Send a document request" automation action both always show an empty,
-- unusable template picker. This adds the missing folder_id column so the
-- new builder UI can slot into the existing Templates library alongside
-- organizer and engagement-letter templates (which already have this column
-- and the matching library_folders-backed "move to folder" UI).

alter table public.document_request_templates
  add column folder_id uuid references public.library_folders(id) on delete set null;
