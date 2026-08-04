import { NextResponse } from "next/server";
import { verifyStripeSignature } from "@/lib/stripe/client";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Stripe is not configured for this environment." }, { status: 503 });
  }

  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature || !(await verifyStripeSignature(payload, signature, webhookSecret))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(payload) as {
    id: string;
    type: string;
    data: { object: Record<string, unknown> };
  };

  const supabase = createServiceClient();
  const { data: logRow } = await supabase
    .from("webhook_events")
    .insert({ provider: "stripe", event_type: event.type, external_id: event.id, payload: event as never })
    .select("id")
    .single();

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as {
        id: string;
        payment_intent: string;
        amount_total: number;
        metadata?: { invoice_id?: string; workspace_id?: string };
      };
      const invoiceId = session.metadata?.invoice_id;
      const workspaceId = session.metadata?.workspace_id;
      if (!invoiceId || !workspaceId) {
        await markWebhookProcessed(supabase, logRow?.id, workspaceId);
        return NextResponse.json({ received: true, skipped: "missing metadata" });
      }

      const { data: invoice } = await supabase.from("invoices").select("client_id").eq("id", invoiceId).single();
      if (!invoice) {
        await markWebhookProcessed(supabase, logRow?.id, workspaceId);
        return NextResponse.json({ received: true, skipped: "invoice not found" });
      }

      // Triggers apply_payment_to_invoice, which updates the invoice status
      // and posts the client_ledger entry -- no extra logic needed here.
      await supabase.from("payments").insert({
        workspace_id: workspaceId,
        client_id: invoice.client_id,
        invoice_id: invoiceId,
        amount: session.amount_total / 100,
        status: "succeeded",
        stripe_payment_intent_id: session.payment_intent,
        stripe_checkout_session_id: session.id,
      });

      await markWebhookProcessed(supabase, logRow?.id, workspaceId);
    } else {
      await markWebhookProcessed(supabase, logRow?.id, undefined);
    }
  } catch (err) {
    await markWebhookFailed(supabase, logRow?.id, err instanceof Error ? err.message : "unknown error");
    throw err;
  }

  return NextResponse.json({ received: true });
}

async function markWebhookProcessed(
  supabase: ReturnType<typeof createServiceClient>,
  webhookEventId: string | undefined,
  workspaceId: string | undefined
) {
  if (!webhookEventId) return;
  await supabase
    .from("webhook_events")
    .update({ status: "processed", processed_at: new Date().toISOString(), workspace_id: workspaceId ?? null })
    .eq("id", webhookEventId);
}

async function markWebhookFailed(supabase: ReturnType<typeof createServiceClient>, webhookEventId: string | undefined, error: string) {
  if (!webhookEventId) return;
  await supabase
    .from("webhook_events")
    .update({ status: "failed", last_error: error, attempts: 1 })
    .eq("id", webhookEventId);
}
