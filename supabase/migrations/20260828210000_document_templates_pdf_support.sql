-- Lets a Document template be authored either as rich text (today's flow)
-- or as an uploaded PDF that gets autofilled at send time -- either by
-- filling the PDF's own fillable form fields ('acroform') or, for a flat
-- PDF with no fillable fields, by drawing text at staff-placed coordinates
-- ('overlay', set by a click-to-place tool in the template editor).
insert into storage.buckets (id, name, public) values ('document-templates', 'document-templates', false);

-- No signature-placement column: the signature_requests flow that these
-- templates plug into never re-renders the document with a signature baked
-- in -- it tracks who signed and when as metadata on signature_request_signers
-- and just locks the original attachment once everyone has signed (see
-- record_signature_by_token). A PDF-mode document behaves the same way a
-- rich-text one already does: rendered once at send time, signing status
-- lives separately.
alter table public.engagement_letter_templates
  add column source_type text not null default 'richtext',
  add column pdf_storage_path text,
  add column pdf_field_mode text,
  add column pdf_field_mappings jsonb not null default '[]'::jsonb;

alter table public.engagement_letter_templates
  add constraint engagement_letter_templates_source_type_check check (source_type in ('richtext', 'pdf')),
  add constraint engagement_letter_templates_pdf_field_mode_check check (pdf_field_mode is null or pdf_field_mode in ('acroform', 'overlay'));

create policy document_templates_select on storage.objects for select
  using (bucket_id = 'document-templates' and is_workspace_member(((storage.foldername(name))[1])::uuid));
create policy document_templates_insert on storage.objects for insert
  with check (bucket_id = 'document-templates' and is_workspace_admin(((storage.foldername(name))[1])::uuid));
create policy document_templates_update on storage.objects for update
  using (bucket_id = 'document-templates' and is_workspace_admin(((storage.foldername(name))[1])::uuid));
create policy document_templates_delete on storage.objects for delete
  using (bucket_id = 'document-templates' and is_workspace_admin(((storage.foldername(name))[1])::uuid));
