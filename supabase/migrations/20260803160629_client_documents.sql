-- Revision Sprint -- Verexa UX Standard #001 (Progressive Disclosure): Documents.
--
-- The UI's Documents section shows "Upload Document" and lists only what has
-- actually been uploaded -- no folders/categories/versioning yet, that's
-- Phase 4. This is the lean table + bucket that makes "uploaded only, no
-- empty placeholders" true today. Reuses the existing documents.view /
-- documents.upload / documents.delete permission keys from Phase 0 -- no new
-- permission catalog entries needed.

create table public.client_documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  file_size_bytes bigint,
  mime_type text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.client_documents is 'Uploaded client documents (lean: no folders/categories/versioning -- deferred to Phase 4). Progressive disclosure: render zero rows until one is uploaded.';

create index client_documents_client_idx on public.client_documents (client_id, created_at desc);
create index client_documents_workspace_idx on public.client_documents (workspace_id);
create index client_documents_uploaded_by_idx on public.client_documents (uploaded_by);

create trigger audit_client_documents after insert or update or delete on public.client_documents for each row execute function public.audit_trigger_fn();

alter table public.client_documents enable row level security;

create policy client_documents_select on public.client_documents for select using (public.has_permission(workspace_id, 'documents.view'));
create policy client_documents_insert on public.client_documents for insert with check (public.has_permission(workspace_id, 'documents.upload') and uploaded_by = (select auth.uid()));
create policy client_documents_delete on public.client_documents for delete using (public.has_permission(workspace_id, 'documents.delete'));

-- ============================================================================
-- Storage: a private bucket (unlike Phase 0's public "branding" bucket --
-- client documents must never be reachable by an unauthenticated URL).
-- Objects are stored under "<workspace_id>/<client_id>/..." so the folder
-- prefix doubles as the tenant boundary, same pattern as "branding".
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('client-documents', 'client-documents', false, 26214400)
on conflict (id) do nothing;

create policy client_documents_storage_select on storage.objects
  for select using (
    bucket_id = 'client-documents'
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'documents.view')
  );

create policy client_documents_storage_insert on storage.objects
  for insert with check (
    bucket_id = 'client-documents'
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'documents.upload')
  );

create policy client_documents_storage_delete on storage.objects
  for delete using (
    bucket_id = 'client-documents'
    and public.has_permission(((storage.foldername(name))[1])::uuid, 'documents.delete')
  );
