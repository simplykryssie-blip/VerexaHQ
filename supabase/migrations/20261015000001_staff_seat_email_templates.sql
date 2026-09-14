-- Platform-level (workspace_id null) transactional templates for the two
-- staff-seat billing notifications, matching the existing
-- billing-card-reminder/usage-80-percent-warning pattern.

insert into public.email_templates (workspace_id, name, slug, category, subject, body_html, merge_fields, status) values
(
  null,
  'Staff Seat Active',
  'staff-seat-active',
  'billing',
  'Your additional staff seat is active',
  'Hi,

Your additional staff seat is now active. {{prorated_amount}} was charged today for the remainder of your current billing period, and the full seat price will apply starting your next billing cycle.

<p><a href="{{dashboard_url}}">Manage your team</a></p>

Thank you.',
  '["prorated_amount","dashboard_url"]'::jsonb,
  'published'
),
(
  null,
  'Staff Seat Payment Failed',
  'staff-seat-payment-failed',
  'billing',
  'Your additional staff seat could not be activated',
  'Hi,

We were unable to charge your card for an additional staff seat ({{failure_reason}}). The seat has not been activated and you have not been charged. You can update your payment method and try again.

<p><a href="{{dashboard_url}}">Manage your team</a></p>

Thank you.',
  '["failure_reason","dashboard_url"]'::jsonb,
  'published'
);
