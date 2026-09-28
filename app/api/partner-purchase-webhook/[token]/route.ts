import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyStripeSignature } from "@/lib/stripe/client";
import { handleExternalPartnerPurchaseCheckoutCompleted } from "@/lib/stripe/handleExternalPartnerPurchase";

// A per-workspace, provider-agnostic purchase intake endpoint -- deliberately
// NOT Stripe Connect. A workspace can point its own, independent Stripe
// account's webhook settings at this URL (see Verexa -> Packages ->
// "External Purchase Webhook") without ever connecting that Stripe account
// to Verexa's platform, which is exactly the situation an existing Stripe
// Payment Link pasted into a public marketing site is already in. The
// [token] segment (workspace_partner_purchase_webhooks.endpoint_token)
// identifies the workspace; the workspace's own pasted-back Stripe signing
// secret (set via set_partner_purchase_webhook_secret) verifies the
// request actually came from Stripe for that workspace's account.
export async function POST(request: Request, { params }: { params: { token: string } }) {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: resolved } = await supabase.rpc("_resolve_partner_purchase_webhook", { p_endpoint_token: params.token }).maybeSingle();
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
    const result = await handleExternalPartnerPurchaseCheckoutCompleted(
      supabase,
      resolved.workspace_id,
      event.data.object as Parameters<typeof handleExternalPartnerPurchaseCheckoutCompleted>[2]
    );
    if ("skipped" in result) {
      return NextResponse.json({ received: true, skipped: result.skipped });
    }
    return NextResponse.json({ received: true, didProcess: result.didProcess });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "unknown error" }, { status: 500 });
  }
}
