-- Continuing the sweep from the last fix: searched every function that
-- inserts into notification_queue (pg_proc source scan) plus every TS
-- call site (grepped for "template_key" project-wide) for hardcoded
-- template_key literals, and cross-checked each against
-- email_templates/sms_templates. Found 3 more casualties of the same
-- remove_system_templates wipe:
--   - payment-receipt (enqueue_payment_receipt trigger, fires when a
--     client payment is recorded) -- clients have never gotten a
--     receipt email.
--   - plan-price-change-notice (handle_plan_price_change trigger,
--     platform-admin side) -- workspace owners/admins never got notified
--     of a pricing change.
--   - trial-ending-notice (lib/stripe/subscriptionWebhooks.ts
--     handleTrialWillEnd, fired from the Stripe customer.subscription
--     trial_will_end webhook) -- no template existed for this at all,
--     even before remove_system_templates (no seed migration for it was
--     found), so this one may never have worked.
-- All three are Email-only in their source (no SMS variant is enqueued
-- anywhere for these), so no SMS templates needed.
insert into public.email_templates (workspace_id, name, slug, category, subject, body_html, merge_fields, status)
values
  (null, 'Payment Receipt', 'payment-receipt', 'billing',
   'Payment received -- invoice {{invoice_number}}',
   E'Hi,\n\nWe have received your payment of ${{amount}} on {{payment_date}} for invoice {{invoice_number}}.\n\nThank you for your business.',
   '["invoice_number", "amount", "payment_date"]'::jsonb, 'published'),
  (null, 'Plan Price Change Notice', 'plan-price-change-notice', 'platform',
   'Upcoming price change to your Verexa plan',
   E'Hi,\n\nYour Verexa subscription''s pricing will change to ${{new_base_price}}/month, effective {{effective_date}}. No action is needed unless you would like to review your plan.\n\nThank you.',
   '["effective_date", "new_base_price"]'::jsonb, 'published'),
  (null, 'Trial Ending Notice', 'trial-ending-notice', 'platform',
   'Your Verexa trial is ending soon',
   E'Hi,\n\nYour Verexa trial ends on {{trial_end}}. To keep using Verexa without interruption, please add a payment method before then.\n\nThank you.',
   '["trial_end"]'::jsonb, 'published');
