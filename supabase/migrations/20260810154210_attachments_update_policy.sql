-- attachments has RLS enabled with SELECT/INSERT/DELETE policies but no
-- UPDATE policy at all, so every write DocumentList.tsx makes (favorite
-- toggle, rename, archive/restore, move to folder, and superseding the old
-- version's is_latest_version flag) is silently blocked by RLS default-deny.
-- Mirrors the existing INSERT policy's permission choice (documents.upload),
-- plus documents.delete since archive/restore is functionally soft-delete.
create policy client_documents_update on public.attachments
for update
using (has_permission(workspace_id, 'documents.upload') or has_permission(workspace_id, 'documents.delete'))
with check (has_permission(workspace_id, 'documents.upload') or has_permission(workspace_id, 'documents.delete'));
