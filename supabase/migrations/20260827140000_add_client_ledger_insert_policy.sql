-- client_ledger had a SELECT policy (billing.view OR is_portal_user) but no
-- INSERT policy at all, so the one place that writes a ledger entry from a
-- normal RLS-bound session -- the Stripe refund route, recording the
-- refund -- silently failed under RLS for every caller, including
-- legitimately authorized staff. Every other ledger entry (invoice issued,
-- payment received) is written by a SECURITY DEFINER trigger
-- (ledger_invoice_issued) that bypasses RLS entirely, which is why this
-- gap went unnoticed. No trigger writes a ledger entry for a refund, so
-- there's no risk of a duplicate entry once this insert can actually
-- succeed.
create policy client_ledger_insert on public.client_ledger for insert
with check (has_permission(workspace_id, 'billing.manage'));
