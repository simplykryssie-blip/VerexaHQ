import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createRefund } from "@/lib/stripe/client";
import { isStripeConfigured } from "@/lib/providerStatus";
import { recordProviderCheck } from "@/lib/providerHealth";
import { getWorkspaceConnectAccount } from "@/lib/stripe/workspaceConnect";
import { hasAal2, AAL2_REQUIRED_RESPONSE_BODY, AAL2_REQUIRED_STATUS } from "@/lib/auth/requireAal2";

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { paymentId, amount } = (await request.json()) as { paymentId?: string; amount?: number };
  if (!paymentId) {
    return NextResponse.json({ error: "paymentId is required" }, { status: 400 });
  }

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("id, workspace_id, client_id, invoice_id, amount, status, refunded_amount, stripe_payment_intent_id")
    .eq("id", paymentId)
    .single();
  if (paymentError || !payment) {
    return NextResponse.json({ error: paymentError?.message ?? "Payment not found" }, { status: 404 });
  }

  const { data: canManageBilling } = await supabase.rpc("has_permission", {
    p_workspace_id: payment.workspace_id,
    p_permission_key: "billing.manage",
  });
  if (!canManageBilling) {
    return NextResponse.json({ error: "Not authorized to issue refunds." }, { status: 403 });
  }

  // VEREXA-AAL-001: issuing a refund moves real money -- a password-only
  // (stolen-credential) session must not be sufficient on its own.
  if (!(await hasAal2(supabase))) {
    return NextResponse.json(AAL2_REQUIRED_RESPONSE_BODY, { status: AAL2_REQUIRED_STATUS });
  }

  if (!payment.stripe_payment_intent_id) {
    return NextResponse.json({ error: "This payment wasn't collected through Stripe -- refund it manually." }, { status: 400 });
  }
  // P12-02: track the true remaining refundable balance instead of trusting
  // payment.status alone -- a prior partial refund must not be mistaken for
  // a full one, and must not block refunding what's actually left.
  const remaining = payment.amount - (payment.refunded_amount ?? 0);
  if (remaining <= 0) {
    return NextResponse.json({ error: "This payment has already been fully refunded." }, { status: 400 });
  }
  if (amount !== undefined && (!(amount > 0) || amount > remaining)) {
    return NextResponse.json(
      { error: `Refund amount must be greater than zero and cannot exceed the remaining refundable balance of ${remaining.toFixed(2)}.` },
      { status: 400 }
    );
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({ configured: false, reason: "Stripe is not configured for this environment." }, { status: 200 });
  }

  const connectAccount = await getWorkspaceConnectAccount(supabase, payment.workspace_id);
  if (!connectAccount.ok) {
    return NextResponse.json({ configured: false, reason: connectAccount.reason }, { status: 200 });
  }

  const refundAmount = amount ?? remaining;
  const result = await createRefund({
    paymentIntentId: payment.stripe_payment_intent_id,
    amount: refundAmount,
    connectedAccountId: connectAccount.accountId,
  });
  if (!result.ok) {
    if (result.reason !== "Stripe is not configured for this environment.") {
      await recordProviderCheck("stripe", false, result.reason);
    }
    return NextResponse.json({ configured: false, reason: result.reason }, { status: 200 });
  }
  await recordProviderCheck("stripe", true);

  const newRefundedAmount = (payment.refunded_amount ?? 0) + refundAmount;
  await supabase
    .from("payments")
    .update({
      status: newRefundedAmount >= payment.amount ? "refunded" : "partially_refunded",
      refunded_amount: newRefundedAmount,
    })
    .eq("id", paymentId);

  if (payment.invoice_id) {
    const { data: invoice } = await supabase
      .from("invoices")
      .select("amount_paid, total_amount")
      .eq("id", payment.invoice_id)
      .single();
    if (invoice) {
      const newAmountPaid = Math.max(invoice.amount_paid - refundAmount, 0);
      await supabase
        .from("invoices")
        .update({
          amount_paid: newAmountPaid,
          status: newAmountPaid <= 0 ? "sent" : newAmountPaid < invoice.total_amount ? "partially_paid" : "paid",
        })
        .eq("id", payment.invoice_id);
    }
  }

  // A firm-billed payment (no client_id) has no client_ledger to post to --
  // client_ledger.client_id is NOT NULL, so this must be skipped rather than
  // attempted with a null id.
  if (payment.client_id) {
    const { data: lastEntry } = await supabase
      .from("client_ledger")
      .select("balance_after")
      .eq("client_id", payment.client_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const balanceAfter = (lastEntry?.balance_after ?? 0) + refundAmount;

    await supabase.from("client_ledger").insert({
      workspace_id: payment.workspace_id,
      client_id: payment.client_id,
      entry_type: "refund",
      reference_table: "payments",
      reference_id: payment.id,
      amount: refundAmount,
      balance_after: balanceAfter,
      description: "Payment refunded",
    });
  }

  return NextResponse.json({ configured: true, refund: result.data });
}
