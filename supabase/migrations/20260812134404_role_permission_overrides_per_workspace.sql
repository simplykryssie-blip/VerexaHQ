-- Replaces the "fork the role on edit" approach: a workspace's permission changes to a shared
-- System role must never affect any other workspace, but the role itself stays the one visible
-- row instead of becoming a workspace-specific copy. Adds a per-workspace override layer.
create table public.role_permission_overrides (
  role_id uuid not null references public.roles(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  granted boolean not null,
  updated_at timestamptz not null default now(),
  primary key (role_id, workspace_id, permission_id)
);

alter table public.role_permission_overrides enable row level security;

create policy role_permission_overrides_select on public.role_permission_overrides
for select using (public.is_workspace_member(workspace_id));

create policy role_permission_overrides_write on public.role_permission_overrides
for all using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));

-- Migrate the one existing fork (System "PTIN Preparer" customized for MKB Financial Group LLC)
-- into override rows, then remove the fork -- nothing is assigned to it, so this is lossless.
insert into public.role_permission_overrides (role_id, workspace_id, permission_id, granted)
select 'b4ace40a-dd09-4717-903c-0b20bccf1338', '3510fe7b-0b31-406a-b245-123127aa1ed8', rp.permission_id, true
from public.role_permissions rp
where rp.role_id = '243d2b83-e0b4-43d2-9208-af9282ffde0e'
  and rp.permission_id not in (select permission_id from public.role_permissions where role_id = 'b4ace40a-dd09-4717-903c-0b20bccf1338');

delete from public.roles where id = '243d2b83-e0b4-43d2-9208-af9282ffde0e';

alter table public.roles drop column forked_from_role_id;

-- Resolves a workspace's own override for a permission first, falling back to the role's
-- global default set -- one shared role row, per-workspace effective permissions.
create or replace function public.has_permission(p_workspace_id uuid, p_permission_key text)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.workspace_users wu
    join public.permissions p on p.key = p_permission_key
    where wu.workspace_id = p_workspace_id
      and wu.user_id = auth.uid()
      and wu.status = 'active'
      and coalesce(
        (select rpo.granted from public.role_permission_overrides rpo
         where rpo.role_id = wu.role_id and rpo.workspace_id = p_workspace_id and rpo.permission_id = p.id),
        exists (select 1 from public.role_permissions rp where rp.role_id = wu.role_id and rp.permission_id = p.id)
      )
  ) or public.is_platform_admin();
$$;
