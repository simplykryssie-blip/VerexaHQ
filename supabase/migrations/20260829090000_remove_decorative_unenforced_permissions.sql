-- Phase 6 (staff permissions & roles): Settings > Roles renders every row in
-- public.permissions as a toggleable checkbox per role, but a database-wide
-- sweep (every RLS policy + function body + frontend has_permission call)
-- found 9 permissions that are never actually read anywhere -- the real
-- gate for each of these areas is hardcoded to is_workspace_admin(),
-- is_platform_admin(), or (for workspace.billing_manage) doesn't exist as a
-- firm-facing feature at all. Toggling any of these for any role, including
-- a firm's own admin role, has zero effect:
--
--   templates.manage        -- organizer/document-request template RLS checks is_workspace_admin()
--   services.manage         -- service catalog page checks is_workspace_admin() RPC, not this permission
--   office_locations.manage -- office_locations RLS checks is_workspace_admin()
--   workspace.delete        -- workspaces DELETE RLS checks is_platform_admin() -- no firm role can ever satisfy this
--   data.export             -- ExportButtons has no permission check of any kind
--   engagements.archive     -- archiving is just a status update, gated only by engagements.manage/assign
--   engagements.review      -- distinct from engagements.approve_review (which IS enforced); this one is unused
--   reports.view            -- the reports index has no gate; every sub-report already checks its own specific permission
--   workspace.billing_manage -- no firm-facing "manage your Verexa subscription" page exists; only platform-admin tooling does
--
-- compliance.view/compliance.manage were considered and deliberately
-- excluded: the compliance report page has an explicit code comment
-- documenting that admin-only access is intentional there, unlike the
-- undocumented gaps above.
--
-- Removing these rows (ON DELETE CASCADE cleans up role_permissions and
-- role_permission_overrides) so Settings > Roles stops showing firm admins
-- controls that silently do nothing.

delete from public.permissions
where key in (
  'templates.manage',
  'services.manage',
  'office_locations.manage',
  'workspace.delete',
  'data.export',
  'engagements.archive',
  'engagements.review',
  'reports.view',
  'workspace.billing_manage'
);
