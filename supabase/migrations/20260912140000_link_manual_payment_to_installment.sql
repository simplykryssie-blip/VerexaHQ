-- Billing audit finding: recording a manual payment (components/billing/
-- RecordPaymentForm.tsx -- the only option today since no live payment
-- processor is connected) only ever inserts into `payments` and lets
-- apply_payment_to_invoice() update the invoice. Nothing anywhere links
-- that payment to an open payment_plans installment -- the only code path
-- that ever sets payment_plans.status = 'paid' is the Stripe Checkout
-- webhook (lib/stripe/handleCheckoutCompleted.ts), which is unreachable
-- without a connected processor. So a manual payment against an invoice
-- that has a payment plan never marks any installment paid, and
-- payment_plan.installment_paid (added in
-- 20260822280000_invoice_payment_automation_triggers.sql) can never fire
-- from the manual-entry flow. This RPC gives the manual flow the same
-- "mark this installment paid" capability the webhook already has.
create or replace function public.apply_manual_payment_to_installment(p_payment_id uuid, p_payment_plan_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_workspace_id uuid;
  v_payment_invoice_id uuid;
  v_plan_invoice_id uuid;
  v_plan_status text;
begin
  select workspace_id, invoice_id into v_workspace_id, v_payment_invoice_id
  from public.payments where id = p_payment_id;

  if v_workspace_id is null then
    raise exception 'payment not found';
  end if;
  if not public.has_permission(v_workspace_id, 'billing.manage') then
    raise exception 'insufficient permissions';
  end if;

  select invoice_id, status into v_plan_invoice_id, v_plan_status
  from public.payment_plans where id = p_payment_plan_id;

  if v_plan_invoice_id is null then
    raise exception 'payment plan installment not found';
  end if;
  if v_plan_invoice_id <> v_payment_invoice_id then
    raise exception 'this installment belongs to a different invoice than the payment';
  end if;
  if v_plan_status <> 'pending' then
    raise exception 'this installment is not pending';
  end if;

  update public.payment_plans
  set status = 'paid', paid_payment_id = p_payment_id
  where id = p_payment_plan_id;
end;
$$;
