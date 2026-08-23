-- Lets a lesson host its own video file in Verexa instead of requiring a
-- YouTube/Vimeo link. learning_modules.video_url stays for an external
-- link; video_storage_path is new and holds the path of a file uploaded
-- into the new private learning-videos bucket. A lesson uses one or the
-- other, never both -- the editor enforces that, not the schema.
--
-- The bucket is private (signed URLs only, generated client-side via
-- createSignedUrl, which itself goes through the SELECT policy below) so
-- access follows the exact same has_learning_hub_access rule as the
-- course/module rows themselves -- a connected office's staff can watch
-- it, a stranger with a leaked URL can't once the signed URL expires.
-- Same path-prefix-encodes-the-owner-workspace-id pattern already used by
-- the branding/client-documents/signatures buckets.

alter table public.learning_modules add column video_storage_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('learning-videos', 'learning-videos', false, 524288000, array['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/ogg']);

create policy learning_videos_storage_insert on storage.objects
  for insert with check (bucket_id = 'learning-videos' and has_permission(((storage.foldername(name))[1])::uuid, 'learning_hub.manage'));

create policy learning_videos_storage_update on storage.objects
  for update using (bucket_id = 'learning-videos' and has_permission(((storage.foldername(name))[1])::uuid, 'learning_hub.manage'));

create policy learning_videos_storage_delete on storage.objects
  for delete using (bucket_id = 'learning-videos' and has_permission(((storage.foldername(name))[1])::uuid, 'learning_hub.manage'));

create policy learning_videos_storage_select on storage.objects
  for select using (bucket_id = 'learning-videos' and has_learning_hub_access(((storage.foldername(name))[1])::uuid));
