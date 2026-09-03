
alter table public.payments
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_checkout_session_id text;

alter table public.invoices
  add column if not exists stripe_checkout_url text;

create unique index if not exists uq_payments_stripe_payment_intent on public.payments (stripe_payment_intent_id) where stripe_payment_intent_id is not null;
create unique index if not exists uq_payments_stripe_checkout_session on public.payments (stripe_checkout_session_id) where stripe_checkout_session_id is not null;
