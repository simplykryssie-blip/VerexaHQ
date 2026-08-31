import { NextResponse } from "next/server";
import { verifyStripeSignature } from "@/lib/stripe/client";
import { createServiceClient } from "@/lib/supabase/service";
import {
  handleCheckoutSessionCompleted,
  handleUsageTopupCheckoutCompleted,
  handlePaymentIntentFailed,
  markWebhookFailed,
  markWebhookProcessed,
} from "@/lib/stripe/handleCheckoutCompleted";
import {
  handleSubscriptionCreated,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleTrialWillEnd,
  handleInvoicePaymentSucceeded,
  handleInvoicePaymentFailed,
} from "@/lib/stripe/subscriptionWebhooks";

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
        metadata?: { invoice_id?: string; payment_plan_id?: string; workspace_id?: string; type?: string; resource_type?: string; units?: string };
      };
      const result =
        session.metadata?.type === "usage_topup"
          ? await handleUsageTopupCheckoutCompleted(supabase, session)
          : await handleCheckoutSessionCompleted(supabase, session);
      await markWebhookProcessed(supabase, logRow?.id, session.metadata?.workspace_id);
      if (result.skipped) {
        return NextResponse.json({ received: true, skipped: result.skipped });
      }
    } else if (event.type === "payment_intent.payment_failed") {
      const intent = event.data.object as Parameters<typeof handlePaymentIntentFailed>[1];
      const result = await handlePaymentIntentFailed(supabase, intent);
      await markWebhookProcessed(supabase, logRow?.id, intent.metadata?.workspace_id);
      if (result.skipped) {
        return NextResponse.json({ received: true, skipped: result.skipped });
      }
    } else if (event.type === "customer.subscription.created") {
      const subscription = event.data.object as Parameters<typeof handleSubscriptionCreated>[1];
      const result = await handleSubscriptionCreated(supabase, subscription);
      await markWebhookProcessed(supabase, logRow?.id, subscription.metadata?.workspace_id);
      if (result.skipped) {
        return NextResponse.json({ received: true, skipped: result.skipped });
      }
    } else if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object as Parameters<typeof handleSubscriptionUpdated>[1];
      const result = await handleSubscriptionUpdated(supabase, subscription);
      await markWebhookProcessed(supabase, logRow?.id, subscription.metadata?.workspace_id);
      if (result.skipped) {
        return NextResponse.json({ received: true, skipped: result.skipped });
      }
    } else if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Parameters<typeof handleSubscriptionDeleted>[1];
      await handleSubscriptionDeleted(supabase, subscription);
      await markWebhookProcessed(supabase, logRow?.id, subscription.metadata?.workspace_id);
    } else if (event.type === "customer.subscription.trial_will_end") {
      const subscription = event.data.object as Parameters<typeof handleTrialWillEnd>[1];
      const result = await handleTrialWillEnd(supabase, subscription);
      await markWebhookProcessed(supabase, logRow?.id, subscription.metadata?.workspace_id);
      if (result.skipped) {
        return NextResponse.json({ received: true, skipped: result.skipped });
      }
    } else if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as Parameters<typeof handleInvoicePaymentSucceeded>[1];
      const result = await handleInvoicePaymentSucceeded(supabase, invoice);
      await markWebhookProcessed(supabase, logRow?.id, undefined);
      if (result.skipped) {
        return NextResponse.json({ received: true, skipped: result.skipped });
      }
    } else if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Parameters<typeof handleInvoicePaymentFailed>[1];
      const result = await handleInvoicePaymentFailed(supabase, invoice);
      await markWebhookProcessed(supabase, logRow?.id, undefined);
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
