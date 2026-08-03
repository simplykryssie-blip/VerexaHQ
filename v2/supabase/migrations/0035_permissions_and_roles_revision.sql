-- Revision Sprint -- Permission Engine + expanded Workspace User roles
--
-- Renames permission keys to the finalized terminology (Contacts -> Clients,
-- Jobs -> Engagements). Safe: role_permissions references permission_id
-- (uuid), never the key text, so retagging the key in place breaks nothing.
-- Adds the granular permissions the Security & Compliance Framework and
-- Client/Engagement work below depend on, and the five additional
-- Workspace User job functions (Reviewer, Compliance Officer, Manager,
-- Administrative Staff, Receptionist) alongside the existing five system
-- roles -- nothing is removed or replaced.

update public.permissions set key = 'clients.view', category = 'clients' where key = 'contacts.view';
update public.permissions set key = 'clients.create', category = 'clients' where key = 'contacts.create';
update public.permissions set key = 'clients.edit', category = 'clients' where key = 'contacts.edit';
update public.permissions set key = 'clients.delete', category = 'clients' where key = 'contacts.delete';
update public.permissions set key = 'clients.merge', category = 'clients' where key = 'contacts.merge';

update public.permissions set key = 'engagements.view', category = 'engagements' where key = 'jobs.view';
update public.permissions set key = 'engagements.manage', category = 'engagements' where key = 'jobs.manage';
update public.permissions set key = 'engagements.assign', category = 'engagements' where key = 'jobs.assign';
update public.permissions set key = 'engagements.review', category = 'engagements' where key = 'jobs.review';

insert into public.permissions (key, category, description) values
  ('identity.itin_reveal', 'identity_vault', 'Reveal a client''s decrypted ITIN'),
  ('engagements.archive', 'engagements', 'Archive a completed or abandoned engagement'),
  ('engagements.approve_review', 'engagements', 'Approve an engagement at the review stage'),
  ('engagements.share', 'engagements', 'Share an engagement with a connected ERO'),
  ('data.export', 'compliance', 'Export client, engagement, or billing data'),
  ('templates.manage', 'templates', 'Create and edit organizer/document-request/engagement-letter/email/SMS templates'),
  ('security.manage', 'security', 'Manage workspace security policy, sessions, and consent records')
on conflict (key) do nothing;

insert into public.roles (workspace_id, name, slug, description, is_system_role) values
  (null, 'Reviewer', 'reviewer', 'Reviews and signs off on engagements before release; does not manage staff or billing.', true),
  (null, 'Compliance Officer', 'compliance_officer', 'Owns compliance tracking, audit review, and security policy for the firm.', true),
  (null, 'Manager', 'manager', 'Manages staff, service catalog, and engagement assignment; day-to-day operations.', true),
  (null, 'Administrative Staff', 'administrative_staff', 'Handles client intake, documents, and messaging.', true),
  (null, 'Receptionist', 'receptionist', 'Front-desk scheduling and light client contact; least-privileged staff role.', true)
on conflict (slug) where workspace_id is null do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.workspace_id is null and r.slug = 'reviewer'
  and p.key in (
    'clients.view', 'engagements.view', 'engagements.review', 'engagements.approve_review',
    'documents.view', 'messages.view', 'messages.internal_note', 'reports.view', 'audit.view'
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.workspace_id is null and r.slug = 'compliance_officer'
  and p.key in (
    'clients.view', 'engagements.view', 'compliance.view', 'compliance.manage',
    'audit.view', 'security.manage', 'reports.view', 'data.export'
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.workspace_id is null and r.slug = 'manager'
  and p.key in (
    'users.invite', 'users.manage',
    'clients.view', 'clients.create', 'clients.edit',
    'engagements.view', 'engagements.manage', 'engagements.assign',
    'services.manage', 'templates.manage', 'reports.view', 'billing.view'
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.workspace_id is null and r.slug = 'administrative_staff'
  and p.key in (
    'clients.view', 'clients.create', 'clients.edit',
    'engagements.view', 'documents.view', 'documents.upload', 'documents.request',
    'messages.view', 'messages.send', 'reports.view'
  )
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.workspace_id is null and r.slug = 'receptionist'
  and p.key in ('clients.view', 'clients.create', 'engagements.view', 'messages.view', 'messages.send')
on conflict do nothing;
