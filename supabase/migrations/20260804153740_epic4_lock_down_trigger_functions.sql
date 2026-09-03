-- New trigger-only functions should never be directly callable via the
-- PostgREST RPC surface, matching the existing house pattern already
-- applied to audit_trigger_fn/set_updated_at/generate_engagement_number.
revoke execute on function public.apply_payment_to_invoice() from public, anon, authenticated;
revoke execute on function public.ledger_invoice_issued() from public, anon, authenticated;
revoke execute on function public.touch_message_thread() from public, anon, authenticated;
revoke execute on function public.generate_quote_number() from public, anon, authenticated;
revoke execute on function public.generate_invoice_number() from public, anon, authenticated;
revoke execute on function public.prefill_engagement_assignments() from public, anon, authenticated;
