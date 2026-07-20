create table if not exists public.client_team_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  client_id uuid not null references public.clients(id),
  user_id uuid not null references auth.users(id),
  granted_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (client_id, user_id)
);

alter table public.client_team_members enable row level security;

create policy client_team_members_select on public.client_team_members
  for select
  using (public.user_has_workspace_access(workspace_id));

create policy client_team_members_write on public.client_team_members
  for all
  using (public.can_staff_write(workspace_id))
  with check (public.can_staff_write(workspace_id));

grant select, insert, update, delete on public.client_team_members to authenticated;
grant select on public.client_team_members to anon;
