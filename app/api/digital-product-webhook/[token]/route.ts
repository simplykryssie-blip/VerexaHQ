import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyStripeSignature } from "@/lib/stripe/client";
import { handleDigitalProductPurchaseCheckoutCompleted } from "@/lib/stripe/handleDigitalProductPurchase";

// A per-workspace, provider-agnostic purchase intake endpoint for one-time
// "digital product" purchases (e.g. MKB's $150 Customized Tax Refund
// Calculator) -- deliberately NOT Stripe Connect, same rationale as
// /api/partner-purchase-webhook/[token]: the product's Stripe Payment Link
// was created outside Verexa's own checkout flow, so Verexa never gets to
// stamp session metadata on it. A workspace admin points that Payment
// Link's own Stripe webhook settings at this URL; the [token] segment
// (workspace_digital_product_purchase_webhooks.endpoint_token) identifies
// the workspace, and the workspace's own pasted-back Stripe signing secret
// (set via set_digital_product_purchase_webhook) verifies the request
// actually came from Stripe for that workspace's account.
export async function POST(request: Request, { params }: { params: { token: string } }) {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: resolved } = await supabase.rpc("_resolve_digital_product_purchase_webhook", { p_endpoint_token: params.token }).maybeSingle();
  if (!resolved?.workspace_id || !resolved.signing_secret) {
    return NextResponse.json({ error: "This purchase webhook is not configured." }, { status: 404 });
  }

  const valid = await verifyStripeSignature(payload, signature, resolved.signing_secret);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(payload) as { id: string; type: string; data: { object: Record<string, unknown> } };

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true, skipped: `unhandled event type: ${event.type}` });
  }

  try {
    const result = await handleDigitalProductPurchaseCheckoutCompleted(
      supabase,
      resolved.workspace_id,
      event.data.object as Parameters<typeof handleDigitalProductPurchaseCheckoutCompleted>[2]
    );
    if ("skipped" in result) {
      return NextResponse.json({ received: true, skipped: result.skipped });
    }
    return NextResponse.json({ received: true, didProcess: result.didProcess });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "unknown error" }, { status: 500 });
  }
}
