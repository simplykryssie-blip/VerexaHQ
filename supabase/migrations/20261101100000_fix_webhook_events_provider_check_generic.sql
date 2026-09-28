-- Live-tested (fixture prefix 90000000-/9000000b-/9000000c-, since cleaned
-- up) and found the generic-webhook infrastructure (20261101080000)
-- completely broken for its own primary use case: webhook_events.provider's
-- CHECK constraint only ever allowed ('stripe', 'resend', 'twilio') --
-- 'generic', the default and most common value for a customer-configured
-- webhook_integrations row, was never added to it. claim_webhook_event's
-- very first INSERT for any generic integration therefore always fails
-- with a check-constraint violation, so no customer-configured generic
-- webhook integration could ever receive a single event. Confirmed live:
-- create_webhook_integration (provider='generic') succeeds, but the very
-- next claim_webhook_event call for that integration raises
-- "new row for relation \"webhook_events\" violates check constraint
-- \"webhook_events_provider_check\"" every time.
--
-- Fix: widen the constraint to also allow 'generic'. No other change --
-- 'stripe'/'resend'/'twilio' (the platform's own outbound-notification and
-- billing webhook ledger rows) keep exactly the same allowed values they
-- already had.
alter table public.webhook_events drop constraint webhook_events_provider_check;
alter table public.webhook_events add constraint webhook_events_provider_check
  check (provider = any (array['stripe'::text, 'resend'::text, 'twilio'::text, 'generic'::text]));
