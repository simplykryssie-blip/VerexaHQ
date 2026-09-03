insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 5242880, array['image/png', 'image/jpeg', 'image/svg+xml', 'image/x-icon', 'image/webp'])
on conflict (id) do nothing;

create policy branding_assets_public_read on storage.objects
  for select using (bucket_id = 'branding');

create policy branding_assets_admin_write on storage.objects
  for insert with check (
    bucket_id = 'branding'
    and public.is_workspace_admin(((storage.foldername(name))[1])::uuid)
  );

create policy branding_assets_admin_update on storage.objects
  for update using (
    bucket_id = 'branding'
    and public.is_workspace_admin(((storage.foldername(name))[1])::uuid)
  );

create policy branding_assets_admin_delete on storage.objects
  for delete using (
    bucket_id = 'branding'
    and public.is_workspace_admin(((storage.foldername(name))[1])::uuid)
  );
