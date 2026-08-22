-- Business-domain access already flows through the layered has_permission()
-- system (role defaults + per-workspace overrides). Nearly every
-- Settings-area action instead gated on the separate, hardcoded
-- is_workspace_admin() (role slug = 'owner'/'admin', bypassing overrides) --
-- so the 9 matching permission keys already defined in `permissions` and
-- toggleable in the Roles UI (users.invite/manage/remove, roles.manage,
-- branding.manage, feature_flags.manage, settings.manage, audit.view,
-- workspace.manage) were checked by zero RLS policies or frontend code.
--
-- Confirmed live before this migration: the system 'owner' and 'admin'
-- roles already have all 9 of these keys granted via role_permissions
-- (shared, workspace_id IS NULL template roles that every workspace_users
-- row references), and no role_permission_overrides revoke any of them --
-- so switching these policies to has_permission() does not remove access
-- from any current admin/owner, it just makes it the same, overridable
-- mechanism as everything else has_permission()-gated.
alter policy workspace_invitations_select on public.workspace_invitations
  using (has_permission(workspace_id, 'users.invite'));
alter policy workspace_invitations_insert on public.workspace_invitations
  with check (has_permission(workspace_id, 'users.invite'));
alter policy workspace_invitations_update on public.workspace_invitations
  using (has_permission(workspace_id, 'users.remove'))
  with check (has_permission(workspace_id, 'users.remove'));

alter policy workspace_users_delete on public.workspace_users
  using (has_permission(workspace_id, 'users.remove'));
alter policy workspace_users_insert on public.workspace_users
  with check (has_permission(workspace_id, 'users.manage'));
alter policy workspace_users_update on public.workspace_users
  using (has_permission(workspace_id, 'users.manage') or (user_id = auth.uid() and status = 'invited'));

alter policy roles_insert on public.roles
  with check (workspace_id is not null and has_permission(workspace_id, 'roles.manage'));
alter policy roles_update on public.roles
  using (workspace_id is not null and has_permission(workspace_id, 'roles.manage'));
alter policy roles_delete on public.roles
  using (workspace_id is not null and has_permission(workspace_id, 'roles.manage'));

alter policy role_permissions_insert on public.role_permissions
  with check (exists (select 1 from public.roles r where r.id = role_permissions.role_id and r.workspace_id is not null and has_permission(r.workspace_id, 'roles.manage')));
alter policy role_permissions_delete on public.role_permissions
  using (exists (select 1 from public.roles r where r.id = role_permissions.role_id and r.workspace_id is not null and has_permission(r.workspace_id, 'roles.manage')));

alter policy role_permission_overrides_write on public.role_permission_overrides
  using (has_permission(workspace_id, 'roles.manage'))
  with check (has_permission(workspace_id, 'roles.manage'));

alter policy branding_insert on public.branding
  with check (has_permission(workspace_id, 'branding.manage'));
alter policy branding_update on public.branding
  using (has_permission(workspace_id, 'branding.manage'))
  with check (has_permission(workspace_id, 'branding.manage'));
alter policy branding_delete on public.branding
  using (has_permission(workspace_id, 'branding.manage'));

alter policy workspace_feature_flags_insert on public.workspace_feature_flags
  with check (has_permission(workspace_id, 'feature_flags.manage'));
alter policy workspace_feature_flags_update on public.workspace_feature_flags
  using (has_permission(workspace_id, 'feature_flags.manage'))
  with check (has_permission(workspace_id, 'feature_flags.manage'));
alter policy workspace_feature_flags_delete on public.workspace_feature_flags
  using (has_permission(workspace_id, 'feature_flags.manage'));

alter policy system_settings_insert on public.system_settings
  with check (has_permission(workspace_id, 'settings.manage'));
alter policy system_settings_update on public.system_settings
  using (has_permission(workspace_id, 'settings.manage'))
  with check (has_permission(workspace_id, 'settings.manage'));
alter policy system_settings_delete on public.system_settings
  using (has_permission(workspace_id, 'settings.manage'));

alter policy audit_log_select on public.audit_log
  using ((workspace_id is not null and has_permission(workspace_id, 'audit.view')) or is_platform_admin());

alter policy workspaces_update on public.workspaces
  using (has_permission(id, 'workspace.manage'));
