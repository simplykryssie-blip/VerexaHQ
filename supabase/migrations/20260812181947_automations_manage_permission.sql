-- Building an automation was hard-gated to is_workspace_admin() with no
-- fine-grained permission at all -- the only lever the app has for "let
-- staff do X" elsewhere is the permission catalog, so add one here instead
-- of leaving this as the one admin-only exception. Default-granted to the
-- more senior/operational roles; owners can widen or narrow it per
-- workspace from Roles & Permissions like every other permission.

insert into public.permissions (key, category, description)
values ('automations.manage', 'automations', 'Create, edit, and delete automations')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key = 'automations.manage'
  and r.workspace_id is null
  and r.slug in ('owner', 'admin', 'manager', 'ero', 'staff')
on conflict do nothing;

drop policy automations_insert on public.automations;
drop policy automations_update on public.automations;
drop policy automations_delete on public.automations;

create policy automations_insert on public.automations
  for insert with check (workspace_id is not null and public.has_permission(workspace_id, 'automations.manage'));

create policy automations_update on public.automations
  for update using (workspace_id is not null and public.has_permission(workspace_id, 'automations.manage'));

create policy automations_delete on public.automations
  for delete using (workspace_id is not null and public.has_permission(workspace_id, 'automations.manage'));
