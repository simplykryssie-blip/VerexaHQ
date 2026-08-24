-- payments_enqueue_receipt fired unconditionally on every payments insert,
-- which was harmless while every insert was a success -- but now that
-- failed Stripe charges (payment_intent.payment_failed) also insert a
-- payments row with status='failed', an unscoped trigger would email the
-- client a "payment receipt" for a payment that never went through.
-- trg_apply_payment_to_invoice already gates on status='succeeded'; this
-- brings the receipt trigger in line with it.
drop trigger payments_enqueue_receipt on public.payments;
create trigger payments_enqueue_receipt after insert on public.payments
  for each row when (new.status = 'succeeded') execute function enqueue_payment_receipt();
