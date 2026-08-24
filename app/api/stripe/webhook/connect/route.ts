import { NextResponse } from "next/server";
import { deriveConnectStatus, verifyStripeSignature } from "@/lib/stripe/client";
import { createServiceClient } from "@/lib/supabase/service";
import { handleCheckoutSessionCompleted, handlePaymentIntentFailed, markWebhookFailed, markWebhookProcessed } from "@/lib/stripe/handleCheckoutCompleted";

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
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
    account?: string;
    data: { object: Record<string, unknown> };
  };

  const supabase = createServiceClient();

  let workspaceId: string | undefined;
  if (event.account) {
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("id")
      .eq("stripe_connected_account_id", event.account)
      .maybeSingle();
    workspaceId = workspace?.id;
  }

  const { data: logRow } = await supabase
    .from("webhook_events")
    .insert({ provider: "stripe", event_type: event.type, external_id: event.id, payload: event as never, workspace_id: workspaceId ?? null })
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
      await markWebhookProcessed(supabase, logRow?.id, session.metadata?.workspace_id ?? workspaceId);
      if (result.skipped) {
        return NextResponse.json({ received: true, skipped: result.skipped });
      }
    } else if (event.type === "payment_intent.payment_failed") {
      const intent = event.data.object as Parameters<typeof handlePaymentIntentFailed>[1];
      const result = await handlePaymentIntentFailed(supabase, intent);
      await markWebhookProcessed(supabase, logRow?.id, intent.metadata?.workspace_id ?? workspaceId);
      if (result.skipped) {
        return NextResponse.json({ received: true, skipped: result.skipped });
      }
    } else if (event.type === "account.updated") {
      if (workspaceId) {
        const account = event.data.object as { charges_enabled: boolean; payouts_enabled: boolean; details_submitted: boolean };
        const status = deriveConnectStatus(account.charges_enabled, account.payouts_enabled, account.details_submitted);
        await supabase
          .from("workspaces")
          .update({
            stripe_charges_enabled: account.charges_enabled,
            stripe_payouts_enabled: account.payouts_enabled,
            stripe_details_submitted: account.details_submitted,
            stripe_connect_status: status,
            stripe_connect_updated_at: new Date().toISOString(),
          })
          .eq("id", workspaceId);
      }
      await markWebhookProcessed(supabase, logRow?.id, workspaceId);
    } else if (event.type === "account.application.deauthorized") {
      if (workspaceId) {
        await supabase
          .from("workspaces")
          .update({
            stripe_connected_account_id: null,
            stripe_connect_account_type: null,
            stripe_charges_enabled: false,
            stripe_payouts_enabled: false,
            stripe_details_submitted: false,
            stripe_connect_status: "not_connected",
            stripe_connect_updated_at: new Date().toISOString(),
          })
          .eq("id", workspaceId);
      }
      await markWebhookProcessed(supabase, logRow?.id, workspaceId);
    } else {
      await markWebhookProcessed(supabase, logRow?.id, workspaceId);
    }
  } catch (err) {
    await markWebhookFailed(supabase, logRow?.id, err instanceof Error ? err.message : "unknown error");
    throw err;
  }

  return NextResponse.json({ received: true });
}
