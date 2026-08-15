insert into public.email_templates (workspace_id, name, slug, category, subject, body_html, merge_fields, status)
select
  null,
  'Client Portal Invite',
  'portal-invite-email',
  'onboarding',
  'You''ve been invited to your client portal',
  '<p>You''ve been invited to access your client portal on {{firm_name}}.</p><p>Click below to accept the invitation and set up your account.</p>',
  '["firm_name"]'::jsonb,
  'published'
where not exists (
  select 1 from public.email_templates where workspace_id is null and slug = 'portal-invite-email'
);
