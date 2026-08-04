import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createRefund } from "@/lib/stripe/client";

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
    .select("id, workspace_id, client_id, invoice_id, amount, status, stripe_payment_intent_id")
    .eq("id", paymentId)
    .single();
  if (paymentError || !payment) {
    return NextResponse.json({ error: paymentError?.message ?? "Payment not found" }, { status: 404 });
  }
  if (!payment.stripe_payment_intent_id) {
    return NextResponse.json({ error: "This payment wasn't collected through Stripe -- refund it manually." }, { status: 400 });
  }
  if (payment.status === "refunded") {
    return NextResponse.json({ error: "This payment has already been refunded." }, { status: 400 });
  }

  const refundAmount = amount ?? payment.amount;
  const result = await createRefund({ paymentIntentId: payment.stripe_payment_intent_id, amount: refundAmount });
  if (!result.ok) {
    return NextResponse.json({ configured: false, reason: result.reason }, { status: 200 });
  }

  await supabase.from("payments").update({ status: "refunded" }).eq("id", paymentId);

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

  return NextResponse.json({ configured: true, refund: result.data });
}
