-- Generic "delayed first charge" capability for the billing engine, added
-- to migrate two pre-existing legacy customer workspaces (Doucet Financial
-- Group, MCJ Consulting LLC) onto real Stripe billing without charging
-- either of them before an exact, contractually-agreed future date.
--
-- first_period_end is set only when a subscription was created with a
-- future billing_cycle_anchor (see createDelayedStartSubscription in
-- lib/stripe/client.ts) -- it stays NULL for every ordinary subscription,
-- including every subscription created before this migration and every
-- new-signup subscription going forward. check-billing-cycles uses it to
-- recognize "this is the subscription's first (stub) period" and skip its
-- normal 7/3/1 pre-cycle CHARGE attempts for that one period only, while
-- still sending reminder-only notifications -- see that file for the full
-- reasoning. Once the anchor date's invoice is created and
-- current_period_end advances past it, the row no longer matches
-- first_period_end and the workspace is indistinguishable from any other
-- customer's normal renewal cycle from then on. This column is the
-- authoritative application-side marker; Stripe subscription metadata may
-- carry the same value for traceability, but it is never read back as a
-- source of truth.
alter table public.workspace_subscriptions
  add column if not exists first_period_end timestamp with time zone;

-- New dunning notification for the first-period reminder-only schedule
-- (7/3/1 days before a delayed first charge) -- mirrors the existing
-- global billing-card-reminder/billing-payment-failed/billing-workspace-
-- suspended templates exactly. Never accompanies an actual charge attempt;
-- see check-billing-cycles.
insert into public.email_templates (workspace_id, name, slug, category, subject, body_html, merge_fields, status)
values (
  null,
  'Billing: first charge upcoming',
  'billing-first-charge-reminder',
  'platform',
  'Your Verexa HQ CRM subscription will be charged on {{period_end}}',
  'Hi,\n\nThis is a reminder that your Verexa HQ CRM subscription''s first billing cycle ends on {{period_end}}. Your card on file will be charged automatically on that date -- no action is needed unless you''d like to update your payment method from Settings -> Plan & Usage.\n\nThank you.',
  '["period_end"]'::jsonb,
  'published'
)
on conflict do nothing;
