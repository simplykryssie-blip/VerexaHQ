-- Lets a workspace list the software it uses (name + link) so staff can
-- jump straight to it from a "Software" dropdown in the main nav, instead
-- of bookmarking things themselves or asking around for a URL.
create table public.workspace_software_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  url text not null,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);
create index workspace_software_links_workspace_id_idx on public.workspace_software_links (workspace_id);

alter table public.workspace_software_links enable row level security;

create policy workspace_software_links_select on public.workspace_software_links
  for select using (public.is_workspace_member(workspace_id));
create policy workspace_software_links_insert on public.workspace_software_links
  for insert with check (public.is_workspace_admin(workspace_id));
create policy workspace_software_links_update on public.workspace_software_links
  for update using (public.is_workspace_admin(workspace_id));
create policy workspace_software_links_delete on public.workspace_software_links
  for delete using (public.is_workspace_admin(workspace_id));
