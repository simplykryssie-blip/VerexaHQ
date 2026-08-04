import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { verifyStripeSignature } from "@/lib/stripe/client";

// Stripe webhooks arrive unauthenticated (no user session) and must be
// verified by signature instead, so this route uses the service-role key
// rather than the cookie-based server client every other route uses.
function createServiceClient() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

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
    type: string;
    data: { object: Record<string, unknown> };
  };

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
      return NextResponse.json({ received: true, skipped: "missing metadata" });
    }

    const supabase = createServiceClient();
    const { data: invoice } = await supabase.from("invoices").select("client_id").eq("id", invoiceId).single();
    if (!invoice) {
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
  }

  return NextResponse.json({ received: true });
}
