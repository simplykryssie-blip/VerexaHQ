-- Additive-only: a separate TEST-mode Stripe Price id per platform plan,
-- alongside the existing stripe_price_id (LIVE). Lets non-Production
-- environments (see lib/env.ts isProductionEnvironment()) check out against
-- a real TEST-mode catalog Price instead of ever touching the LIVE one.
-- stripe_price_id itself is untouched -- Production behavior does not change.
alter table public.platform_subscription_plans
  add column stripe_test_price_id text;

comment on column public.platform_subscription_plans.stripe_test_price_id is
  'Stripe TEST-mode Price id mirroring stripe_price_id (LIVE) for the same plan -- used only outside Production. Never resolved in Production and never a fallback for a missing stripe_price_id.';
