-- Seed Verexa's own platform subscription plans (what Verexa charges workspaces).
-- Overage rates are cost-covered against real vendor pricing (Resend/Twilio/Supabase Storage)
-- but are not yet metered/auto-billed anywhere -- this is a rate card, not a live billing engine.

insert into platform_subscription_plans (
  slug, name, base_price_cents, included_seats, per_seat_price_cents,
  email_overage_rate_cents, sms_overage_rate_cents, storage_overage_rate_cents,
  currency, is_active
) values
  ('solo', 'Solo', 5900, 1, 3900, 1, 4, 15, 'usd', true),
  ('team', 'Team', 12900, 3, 3500, 1, 4, 15, 'usd', true),
  ('firm', 'Firm', 24900, 6, 2500, 1, 4, 15, 'usd', true)
on conflict (slug) do nothing;
