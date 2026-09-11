-- Manual payments (check/cash/bank transfer, recorded by staff) had no way
-- to capture how they were actually paid -- just a free-text reference
-- field. Adds a real payment_method column; Stripe-driven payments get
-- backfilled to 'stripe' so the column is consistent going forward.

alter table public.payments
  add column if not exists payment_method text
    check (payment_method is null or payment_method in ('stripe', 'check', 'cash', 'bank_transfer', 'other'));

update public.payments
set payment_method = 'stripe'
where payment_method is null and (stripe_payment_intent_id is not null or stripe_checkout_session_id is not null);
