insert into public.permissions (key, category, description) values
  ('irs_authorizations.view', 'irs_authorizations', 'View IRS Form 8821 authorizations and their status'),
  ('irs_authorizations.manage', 'irs_authorizations', 'Create IRS Form 8821 authorizations, generate the document, and advance its status'),
  ('irs_authorizations.review_identity', 'irs_authorizations', 'Review a client''s submitted ID photo and selfie and approve or reject identity verification')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.is_system_role and r.slug in ('owner', 'admin', 'ero')
  and p.key in ('irs_authorizations.view', 'irs_authorizations.manage', 'irs_authorizations.review_identity')
on conflict do nothing;
