
create index if not exists idx_workspace_invitations_accepted_by on public.workspace_invitations (accepted_by);
create index if not exists idx_workspace_invitations_invited_by on public.workspace_invitations (invited_by);
create index if not exists idx_workspace_invitations_role_id on public.workspace_invitations (role_id);
