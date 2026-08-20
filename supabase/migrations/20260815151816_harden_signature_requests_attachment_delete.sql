-- signature_requests holds the legal record of a signed engagement letter
-- or organizer (who signed, when, typed name, signers). attachment_id
-- points at the stored file object, and was ON DELETE CASCADE -- so
-- deleting the underlying attachments row (e.g. future storage cleanup,
-- a "delete document" feature, or direct table access) would silently
-- destroy the signature record along with it via
-- signature_request_signers.signature_request_id's own CASCADE.
--
-- No current UI path hard-deletes attachments (Documents only ever sets
-- is_archived=true -- verified live in components/documents/DocumentList.tsx),
-- so this has caused no data loss. It's a defensive hardening: a signed
-- legal record should never depend on the underlying file object still
-- existing. attachment_id is already nullable, so this is a pure
-- constraint change with no data migration needed.
alter table public.signature_requests
  drop constraint signature_requests_attachment_id_fkey;

alter table public.signature_requests
  add constraint signature_requests_attachment_id_fkey
  foreign key (attachment_id) references public.attachments(id) on delete set null;
