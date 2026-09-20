-- CONTACTS COMPLETION PASS -- Phase 5a: generic signature-request final
-- signed PDF (Contacts Reconciliation Audit item #4). The engagement-letter
-- signing flow already files a real merged PDF; the generic (uploaded-PDF)
-- signature-request flow only ever locked the original attachment
-- (is_locked = true) with no flattened output. final_pdf_attachment_id
-- tracks which attachment IS that flattened result, and doubles as the
-- idempotency guard so re-triggering the file route after every signer
-- (see app/api/sign/finalize/route.ts) doesn't refile it twice.
alter table public.signature_requests
  add column if not exists final_pdf_attachment_id uuid references public.attachments(id);
