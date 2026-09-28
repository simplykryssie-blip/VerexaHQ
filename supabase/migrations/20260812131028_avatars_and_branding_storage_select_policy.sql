-- Root cause of "photo/logo upload didn't save" + the RLS error: upsert:true makes the
-- Storage API check whether the object already exists before writing, which needs a SELECT
-- policy -- these two buckets only ever had INSERT/UPDATE/DELETE, so every upsert-mode
-- upload was silently blocked at that internal existence check (confirmed empirically:
-- storage.objects had zero rows ever written to either bucket, while client-documents,
-- whose uploads don't use upsert and already has a SELECT policy, has real rows).
create policy "avatars_self_select" on storage.objects
for select
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "branding_assets_admin_select" on storage.objects
for select
using (
  bucket_id = 'branding'
  and is_workspace_admin((storage.foldername(name))[1]::uuid)
);
