import { NextResponse } from "next/server";
import { deriveConnectStatus, verifyStripeSignature } from "@/lib/stripe/client";
import { createServiceClient } from "@/lib/supabase/service";
import { handleCheckoutSessionCompleted, handlePaymentIntentFailed, markWebhookFailed, markWebhookProcessed } from "@/lib/stripe/handleCheckoutCompleted";
import {
  handleFirmPackagePurchaseCheckoutCompleted,
  handleFirmPackageSubscriptionUpdated,
  handleFirmPackageSubscriptionDeleted,
} from "@/lib/stripe/handleFirmPackagePurchase";
import { handleExternalPartnerPurchaseCheckoutCompleted } from "@/lib/stripe/handleExternalPartnerPurchase";

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

  // Atomic claim: same event-level dedup as the platform webhook (see
  // claim_stripe_webhook_event) -- the database decides exactly once
  // whether this event.id should be processed. workspace_id is stamped in
  // afterward via markWebhookProcessed, same as before.
  const { data: claim, error: claimError } = await supabase
    .rpc("claim_stripe_webhook_event", { p_event_id: event.id, p_event_type: event.type, p_payload: event as never })
    .single();

  if (claimError) {
    return NextResponse.json({ error: "Could not record webhook event" }, { status: 500 });
  }

  const logRow = { id: claim?.id };

  if (!claim?.should_process) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as {
        id: string;
        mode?: string;
        customer?: string | { id: string };
        subscription?: string | { id: string } | null;
        payment_intent: string;
        amount_total: number;
        currency?: string;
        payment_link?: string | null;
        customer_details?: { name?: string | null; email?: string | null; phone?: string | null } | null;
        metadata?: { invoice_id?: string; payment_plan_id?: string; workspace_id?: string; type?: string; purchase_id?: string };
      };
      let result =
        session.metadata?.type === "firm_package_purchase"
          ? await handleFirmPackagePurchaseCheckoutCompleted(supabase, session)
          : await handleCheckoutSessionCompleted(supabase, session);

      // Neither of Verexa's own metadata-driven flows matched. This could be
      // an externally-created Stripe Payment Link (pasted directly into the
      // public marketing site) completing on this same Stripe-Connected
      // account -- it carries no Verexa metadata at all, so it always lands
      // here rather than the branches above. session.payment_link is only
      // ever present on a genuine Payment-Link-originated session (Verexa's
      // own checkout.session.create() calls never set it), so gating on it
      // means this can't misfire against an unrelated skip reason from the
      // handlers above. Resolves the package the same way the standalone
      // partner-purchase webhook already does for non-Connected workspaces
      // (app/api/partner-purchase-webhook/[token]/route.ts) -- matching
      // session.payment_link against this workspace's own firm_packages.
      if (result.skipped && workspaceId && session.payment_link) {
        const externalResult = await handleExternalPartnerPurchaseCheckoutCompleted(supabase, workspaceId, session);
        if (!("skipped" in externalResult)) {
          result = { skipped: undefined };
        }
      }

      await markWebhookProcessed(supabase, logRow?.id, session.metadata?.workspace_id ?? workspaceId);
      if (result.skipped) {
        return NextResponse.json({ received: true, skipped: result.skipped });
      }
    } else if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object as Parameters<typeof handleFirmPackageSubscriptionUpdated>[1];
      const result = await handleFirmPackageSubscriptionUpdated(supabase, subscription);
      await markWebhookProcessed(supabase, logRow?.id, workspaceId);
      if (result.skipped) {
        return NextResponse.json({ received: true, skipped: result.skipped });
      }
    } else if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Parameters<typeof handleFirmPackageSubscriptionDeleted>[1];
      const result = await handleFirmPackageSubscriptionDeleted(supabase, subscription);
      await markWebhookProcessed(supabase, logRow?.id, workspaceId);
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
