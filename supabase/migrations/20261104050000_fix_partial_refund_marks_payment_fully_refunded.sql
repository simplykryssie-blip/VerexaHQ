-- P12-02: /api/stripe/refund unconditionally set payments.status = 'refunded'
-- regardless of whether the issued refund covered the full payment amount,
-- so a partial refund permanently marked the payment as fully refunded --
-- hiding the remaining refundable balance from staff and blocking any
-- further refund of it (the route already refuses to act on a payment whose
-- status is 'refunded'). Tracking the cumulative refunded amount lets the
-- route tell a true full refund apart from a partial one.
alter table public.payments
  add column refunded_amount numeric(12,2) not null default 0;

alter table public.payments
  add constraint payments_refunded_amount_chk check (refunded_amount >= 0 and refunded_amount <= amount);

-- Every payment already marked 'refunded' under the old all-or-nothing
-- logic was, as far as this column is concerned, refunded in full.
update public.payments
set refunded_amount = amount
where status = 'refunded';
