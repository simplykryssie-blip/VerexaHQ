-- Staff (and portal user) profile photos, shown on internal messages and profile pages.
-- user_profiles.avatar_url already exists; this just provisions somewhere to upload to.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars_self_insert" on storage.objects
for insert
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "avatars_self_update" on storage.objects
for update
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "avatars_self_delete" on storage.objects
for delete
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);
