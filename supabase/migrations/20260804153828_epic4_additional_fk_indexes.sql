create index idx_invoices_engagement on public.invoices(engagement_id);
create index idx_quotes_engagement on public.quotes(engagement_id);
create index idx_change_orders_quote on public.change_orders(quote_id);
create index idx_recurring_billing_engagement on public.recurring_billing(engagement_id);
create index idx_recurring_billing_payment_method on public.recurring_billing(payment_method_id);
create index idx_payments_payment_method on public.payments(payment_method_id);
create index idx_email_log_message on public.email_log(message_id);
create index idx_sms_log_message on public.sms_log(message_id);
