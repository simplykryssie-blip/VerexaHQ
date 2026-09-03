
-- Safe to expose to a not-yet-authenticated visitor: only what's needed to
-- render "you've been invited" before they sign in/up. No workspace_id, no
-- role_id, nothing else about the workspace leaks through this.
create or replace function public.get_invitation_preview(p_token uuid)
returns table(email text, status text, expires_at timestamptz, workspace_name text, role_name text)
language sql
security definer
set search_path to 'public'
stable
as $$
  select wi.email, wi.status, wi.expires_at, w.name, r.name
  from public.workspace_invitations wi
  join public.workspaces w on w.id = wi.workspace_id
  join public.roles r on r.id = wi.role_id
  where wi.token = p_token;
$$;
