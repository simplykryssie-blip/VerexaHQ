import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/serverAuth";
import { isStripeConfigured } from "@/lib/providerStatus";

export async function POST(req: NextRequest) {
  if (!isStripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false, reason: "Stripe webhook not configured." }, { status: 503 });
  }
  let supabase;
  try { supabase = createServiceClient(); } catch {
    return NextResponse.json({ ok: false, reason: "Server billing credential not configured." }, { status: 503 });
  }
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ ok: false, error: "Missing Stripe signature." }, { status: 400 });

  let event;
  try { event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET as string); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Invalid webhook signature." }, { status: 400 }); }

  if (event.type === "checkout.session.completed" || event.type === "payment_intent.succeeded") {
    const obj = event.data.object as { metadata?: { invoice_id?: string }; amount_total?: number; amount_received?: number; amount?: number; currency?: string };
    const invoiceId = obj.metadata?.invoice_id;
    const amountPaid = Number(obj.amount_total ?? obj.amount_received ?? obj.amount ?? 0) / 100;
    if (invoiceId && amountPaid > 0) {
      const { data: existing } = await supabase.from("invoice_payments").select("id").eq("external_transaction_id", event.id).maybeSingle();
      if (!existing) {
        const { data: invoice } = await supabase.from("invoices").select("*").eq("id", invoiceId).maybeSingle();
        if (invoice) {
          const { error: paymentError } = await supabase.from("invoice_payments").insert({ workspace_id: invoice.workspace_id, invoice_id: invoiceId, client_id: invoice.client_id, payment_amount: amountPaid, payment_status: "completed", payment_method: "Stripe", paid_at: new Date().toISOString(), source_type: "stripe", external_transaction_id: event.id });
          if (paymentError) return NextResponse.json({ ok: false, error: "Unable to record payment." }, { status: 500 });
          const newAmountPaid = Number(invoice.amount_paid) + amountPaid;
          await supabase.from("invoices").update({ amount_paid: newAmountPaid, invoice_status: newAmountPaid >= Number(invoice.total_amount) ? "paid" : "partially_paid", paid_at: newAmountPaid >= Number(invoice.total_amount) ? new Date().toISOString() : null, external_provider_status: "paid", external_last_synced_at: new Date().toISOString() }).eq("id", invoiceId);
        }
      }
    }
  }
  return NextResponse.json({ ok: true, received: true });
}
