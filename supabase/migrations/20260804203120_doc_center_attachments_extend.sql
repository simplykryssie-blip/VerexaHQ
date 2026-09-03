
alter table public.attachments
  add column if not exists folder_id uuid,
  add column if not exists is_favorite boolean not null default false,
  add column if not exists is_archived boolean not null default false,
  add column if not exists visibility text not null default 'internal',
  add column if not exists replaces_attachment_id uuid references public.attachments(id),
  add column if not exists is_latest_version boolean not null default true,
  add column if not exists is_locked boolean not null default false,
  add column if not exists ai_metadata jsonb;

alter table public.attachments
  add constraint attachments_visibility_check check (visibility in ('internal', 'client_visible'));

comment on column public.attachments.ai_metadata is
  'Reserved for future AI features (OCR text, auto-classification, duplicate hash, suggested folder, extracted metadata). Not populated by anything yet.';

create index if not exists idx_attachments_folder on public.attachments (folder_id);
create index if not exists idx_attachments_replaces on public.attachments (replaces_attachment_id);
create index if not exists idx_attachments_favorite on public.attachments (workspace_id) where is_favorite;
