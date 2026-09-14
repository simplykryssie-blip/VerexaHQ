-- Platform-level (workspace_id null) transactional template for the new
-- 80%-usage warning notification, matching the existing
-- billing-card-reminder/billing-payment-failed pattern. dashboard_url is
-- injected into every dispatch-notifications job's payload alongside the
-- existing portal_link merge field.

insert into public.email_templates (workspace_id, name, slug, category, subject, body_html, merge_fields, status) values
(
  null,
  'Usage 80% Warning',
  'usage-80-percent-warning',
  'billing',
  'Your {{resource_label}} usage is at about 80%',
  'Hi,

Your {{resource_label}} usage is at approximately 80% of your available balance (your free allowance plus any prepaid balance). Once it runs out, {{resource_label}} will stop until you add more.

<p><a href="{{dashboard_url}}">Manage your usage and top up</a></p>

Thank you.',
  '["resource_label","dashboard_url"]'::jsonb,
  'published'
);
