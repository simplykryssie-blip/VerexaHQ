-- Cover the two auth.users FKs introduced in 0044 that the performance
-- advisor flagged as missing an index, matching the existing convention
-- (audit_log.actor_id, workspace_users.invited_by, etc.).
create index if not exists client_notes_author_idx on public.client_notes (author_id);
create index if not exists client_portal_users_invited_by_idx on public.client_portal_users (invited_by);
