-- Idempotency flags for the new "auto-file into Documents" API routes
-- (app/api/documents/file-organizer-response, file-signed-engagement-letter):
-- both routes are called from client-side code right after a public
-- submission succeeds, so a page refresh or double-click must not create a
-- second attachment for the same response/signature.

alter table public.organizer_responses
  add column if not exists filed_as_attachment boolean not null default false;

alter table public.engagement_letter_public_signatures
  add column if not exists filed_as_attachment boolean not null default false;
