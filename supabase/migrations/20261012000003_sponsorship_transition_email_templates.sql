-- Platform-level (workspace_id null) transactional templates for the 4
-- sponsorship-transition notifications, matching the existing
-- billing-card-reminder/billing-payment-failed pattern. dashboard_url is
-- injected into every dispatch-notifications job's payload (see
-- app/api/cron/dispatch-notifications/route.ts) alongside the existing
-- portal_link merge field, so it needs no per-send resolution here.

insert into public.email_templates (workspace_id, name, slug, category, subject, body_html, merge_fields, status) values
(
  null,
  'Sponsorship Release Notice',
  'sponsorship-release-notice',
  'billing',
  'Your access to {{firm_name}} continues through {{sponsorship_end_date}}',
  'Hi,

{{firm_name}} has released you from their Verexa HQ CRM workspace. This does not affect your access today -- you can keep using your account exactly as before through {{sponsorship_end_date}}, since {{firm_name}} has already paid for that billing period.

After {{sponsorship_end_date}}, you will need your own Verexa billing to keep your account active. Nothing will be charged automatically, and no subscription will be started without your say-so -- when you are ready, sign in and click "Set Up My Billing" to start a {{plan_name}} plan at {{monthly_price}}/month.

<p><a href="{{dashboard_url}}">Set Up My Billing</a></p>

Thank you.',
  '["firm_name","sponsorship_end_date","plan_name","monthly_price","dashboard_url"]'::jsonb,
  'published'
),
(
  null,
  'Sponsorship Upcoming Reminder',
  'sponsorship-upcoming-reminder',
  'billing',
  'Reminder: your access through {{firm_name}} ends {{sponsorship_end_date}}',
  'Hi,

Just a reminder -- your access through {{firm_name}}''s Verexa HQ CRM workspace ends on {{sponsorship_end_date}}. To keep using your account without interruption after that date, set up your own billing now.

Click below to start a {{plan_name}} plan at {{monthly_price}}/month. Nothing is charged until you complete checkout.

<p><a href="{{dashboard_url}}">Set Up My Billing</a></p>

Thank you.',
  '["firm_name","sponsorship_end_date","plan_name","monthly_price","dashboard_url"]'::jsonb,
  'published'
),
(
  null,
  'Sponsorship Final Reminder',
  'sponsorship-final-reminder',
  'billing',
  'Final reminder: your access through {{firm_name}} ends tomorrow ({{sponsorship_end_date}})',
  'Hi,

This is your final reminder -- your access through {{firm_name}}''s Verexa HQ CRM workspace ends tomorrow, {{sponsorship_end_date}}. If you have not set up your own billing by then, your account will be suspended until you do.

Click below to start a {{plan_name}} plan at {{monthly_price}}/month. Nothing is charged until you complete checkout.

<p><a href="{{dashboard_url}}">Set Up My Billing</a></p>

Thank you.',
  '["firm_name","sponsorship_end_date","plan_name","monthly_price","dashboard_url"]'::jsonb,
  'published'
),
(
  null,
  'Sponsorship Personal Billing Active',
  'sponsorship-billing-active',
  'billing',
  'Your Verexa HQ CRM billing is now active',
  'Hi,

Your personal Verexa HQ CRM billing is now active on the {{plan_name}} plan at {{monthly_price}}/month. Your account will continue without interruption.

Thank you.',
  '["plan_name","monthly_price"]'::jsonb,
  'published'
);
