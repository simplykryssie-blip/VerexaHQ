import { NextResponse } from "next/server";
import { verifyStripeSignature } from "@/lib/stripe/client";
import { createServiceClient } from "@/lib/supabase/service";
import { handleCheckoutSessionCompleted, markWebhookFailed, markWebhookProcessed } from "@/lib/stripe/handleCheckoutCompleted";

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
        metadata?: { invoice_id?: string; payment_plan_id?: string; workspace_id?: string };
      };
      const result = await handleCheckoutSessionCompleted(supabase, session);
      await markWebhookProcessed(supabase, logRow?.id, session.metadata?.workspace_id);
      if (result.skipped) {
        return NextResponse.json({ received: true, skipped: result.skipped });
      }
    } else {
      await markWebhookProcessed(supabase, logRow?.id, undefined);
    }
  } catch (err) {
    await markWebhookFailed(supabase, logRow?.id, err instanceof Error ? err.message : "unknown error");
    throw err;
  }

  return NextResponse.json({ received: true });
}
