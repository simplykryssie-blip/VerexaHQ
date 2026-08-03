-- Phase 0: Platform Foundation
-- Seed data: permission catalog, system role templates + their grants,
-- and the feature flag catalog. All additive -- later phases INSERT more
-- permissions/flags here without altering existing rows.

-- ============================================================================
-- permissions catalog
-- ============================================================================
insert into public.permissions (key, category, description) values
  ('workspace.manage', 'workspace', 'Edit workspace profile, timezone, and status'),
  ('workspace.billing_manage', 'workspace', 'Manage the firm''s own subscription and billing with Verexa'),
  ('workspace.delete', 'workspace', 'Archive or permanently delete the workspace'),
  ('users.invite', 'users', 'Invite new team members to the workspace'),
  ('users.manage', 'users', 'Edit team member roles and profiles'),
  ('users.remove', 'users', 'Revoke a team member''s access'),
  ('roles.manage', 'roles', 'Create and edit custom roles and their permissions'),
  ('feature_flags.manage', 'feature_flags', 'Enable or disable modules for the workspace'),
  ('settings.manage', 'settings', 'Edit workspace system settings'),
  ('branding.manage', 'branding', 'Edit logo, colors, and portal branding'),
  ('office_locations.manage', 'office_locations', 'Create and edit office locations'),
  ('contacts.view', 'contacts', 'View contact records'),
  ('contacts.create', 'contacts', 'Create new contact records'),
  ('contacts.edit', 'contacts', 'Edit existing contact records'),
  ('contacts.delete', 'contacts', 'Delete or archive contact records'),
  ('contacts.merge', 'contacts', 'Merge duplicate contact records'),
  ('identity.ssn_reveal', 'identity_vault', 'Reveal a contact''s decrypted SSN'),
  ('identity.ein_reveal', 'identity_vault', 'Reveal a contact''s decrypted EIN'),
  ('services.manage', 'services', 'Manage service catalog, packages, and pricing'),
  ('jobs.view', 'jobs', 'View jobs/engagements'),
  ('jobs.manage', 'jobs', 'Create and edit jobs/engagements'),
  ('jobs.assign', 'jobs', 'Assign jobs to preparers/staff'),
  ('jobs.review', 'jobs', 'Perform reviewer sign-off on jobs'),
  ('documents.view', 'documents', 'View documents'),
  ('documents.upload', 'documents', 'Upload documents'),
  ('documents.delete', 'documents', 'Delete or archive documents'),
  ('documents.request', 'documents', 'Send document requests to clients'),
  ('messages.view', 'messages', 'View message threads'),
  ('messages.send', 'messages', 'Send messages to clients or staff'),
  ('messages.internal_note', 'messages', 'Post internal-only notes'),
  ('billing.view', 'billing', 'View invoices and payments'),
  ('billing.manage', 'billing', 'Create/edit quotes, invoices, and payment plans'),
  ('billing.refund', 'billing', 'Issue refunds and credits'),
  ('portal.manage', 'portal', 'Manage client portal access and content'),
  ('reports.view', 'reports', 'View firm reports and dashboards'),
  ('compliance.view', 'compliance', 'View compliance tracking data'),
  ('compliance.manage', 'compliance', 'Manage compliance rules and deadlines'),
  ('audit.view', 'audit', 'View the workspace audit log')
on conflict (key) do nothing;

-- ============================================================================
-- system role templates (workspace_id is null => shared by every workspace)
-- ============================================================================
insert into public.roles (workspace_id, name, slug, description, is_system_role) values
  (null, 'Owner', 'owner', 'Full control of the workspace, including billing and deletion.', true),
  (null, 'Admin', 'admin', 'Full operational control except workspace deletion.', true),
  (null, 'ERO', 'ero', 'Electronic Return Originator: client, job, and document authority including identity reveal.', true),
  (null, 'PTIN Preparer', 'ptin_preparer', 'Prepares client work; no identity reveal or billing authority.', true),
  (null, 'Staff', 'staff', 'Support staff with read-heavy, limited-write access.', true)
on conflict (slug) where workspace_id is null do nothing;

-- Owner: every permission that exists.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'owner'
on conflict do nothing;

-- Admin: everything except deleting the workspace itself.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'admin'
  and p.key <> 'workspace.delete'
on conflict do nothing;

-- ERO: full client/job/document/identity authority, no workspace/billing/role administration.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'ero'
  and p.key in (
    'users.invite',
    'contacts.view', 'contacts.create', 'contacts.edit', 'contacts.delete', 'contacts.merge',
    'identity.ssn_reveal', 'identity.ein_reveal',
    'services.manage',
    'jobs.view', 'jobs.manage', 'jobs.assign', 'jobs.review',
    'documents.view', 'documents.upload', 'documents.delete', 'documents.request',
    'messages.view', 'messages.send', 'messages.internal_note',
    'billing.view',
    'portal.manage',
    'reports.view',
    'compliance.view', 'compliance.manage',
    'audit.view'
  )
on conflict do nothing;

-- PTIN Preparer: does the work, cannot reveal identity data or touch billing/admin.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'ptin_preparer'
  and p.key in (
    'contacts.view', 'contacts.create', 'contacts.edit',
    'jobs.view', 'jobs.manage',
    'documents.view', 'documents.upload', 'documents.request',
    'messages.view', 'messages.send', 'messages.internal_note',
    'reports.view'
  )
on conflict do nothing;

-- Staff: read-heavy support role.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.workspace_id is null and r.slug = 'staff'
  and p.key in (
    'contacts.view',
    'jobs.view',
    'documents.view', 'documents.upload',
    'messages.view', 'messages.send',
    'reports.view'
  )
on conflict do nothing;

-- ============================================================================
-- feature flag catalog
-- ============================================================================
insert into public.feature_flags (key, name, description, module, is_core, default_enabled) values
  ('crm', 'CRM', 'Unified contact and pipeline management', 'crm', true, true),
  ('client_portal', 'Client Portal', 'Client-facing portal for documents, messages, and billing', 'client_portal', true, true),
  ('workflow_automation', 'Workflow Automation', 'Job templates, checklists, and automation rules', 'workflow_automation', true, true),
  ('document_management', 'Document Management', 'Folders, uploads, versioning, and document requests', 'documents', true, true),
  ('secure_messaging', 'Secure Messaging', 'Unified inbox for portal, email, and SMS conversations', 'communication', true, true),
  ('billing', 'Billing', 'Quotes, invoices, payments, and payment plans', 'billing', true, true),
  ('engagement_management', 'Engagement Management', 'Jobs, engagement letters, and reviewer workflows', 'jobs', true, true),
  ('team_management', 'Team Management', 'Roles, permissions, and staff administration', 'team', true, true),
  ('scheduling', 'Scheduling', 'Appointment booking and calendar management', 'scheduling', true, true),
  ('service_packages', 'Service Packages', 'Service catalog, packages, and pricing rules', 'services', true, true),
  ('compliance_tracking', 'Compliance Tracking', 'Due dates, deadlines, and compliance monitoring', 'compliance', true, true),
  ('firm_operations', 'Firm Operations', 'Office locations, branding, and system settings', 'operations', true, true),
  ('bookkeeping', 'Bookkeeping', 'Bookkeeping engagements and financial reporting', 'expansion', false, false),
  ('payroll', 'Payroll', 'Payroll processing and filings', 'expansion', false, false),
  ('business_formation', 'Business Formation', 'Entity formation and registered agent services', 'expansion', false, false),
  ('tax_planning', 'Tax Planning', 'Proactive tax planning engagements', 'expansion', false, false),
  ('tax_resolution', 'Tax Resolution', 'IRS notice and resolution case management', 'expansion', false, false),
  ('advisory', 'Advisory', 'CFO/advisory engagements', 'expansion', false, false)
on conflict (key) do nothing;
