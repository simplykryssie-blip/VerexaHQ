import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// Receiving end for an external package purchase (e.g. a Doucet website
// checkout) with no Verexa account, workspace, or subscription involved.
// The path token is opaque and per-workspace (workspace_partner_purchase_webhooks),
// but the token alone is not the trust boundary -- every request must also
// carry a valid HMAC-SHA256 signature over the raw body, computed with the
// signing secret handed to the integration owner once via
// set_partner_purchase_webhook. This is deliberately provider-agnostic:
// Doucet's actual checkout technology is external and unverified as Stripe
// under Verexa's own account, so this does not reuse Stripe's webhook
// verification -- whatever system originates the purchase (Doucet's own
// site, their own Stripe/Square/other account) signs its call to Verexa
// with this shared secret instead.
//
// The owning workspace is resolved from the token -> signing_secret
// mapping stored server-side, never from the request body -- a caller
// cannot choose which workspace's package this purchase belongs to.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createServiceClient();

  const { data: resolvedRows, error: resolveError } = await supabase.rpc("_resolve_partner_purchase_webhook", {
    p_endpoint_token: token,
  });
  const resolved = resolvedRows?.[0];

  if (resolveError || !resolved) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-verexa-signature") ?? "";

  const expectedSignature = createHmac("sha256", resolved.signing_secret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expectedSignature);
  const providedBuf = Buffer.from(signatureHeader);
  const signatureValid =
    expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);

  if (!signatureValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON" }, { status: 400 });
  }

  const packageId = typeof payload.package_id === "string" ? payload.package_id : undefined;
  const purchaserName = typeof payload.purchaser_name === "string" ? payload.purchaser_name : undefined;
  const purchaserEmail = typeof payload.purchaser_email === "string" ? payload.purchaser_email : undefined;
  const purchaserPhone = typeof payload.purchaser_phone === "string" ? payload.purchaser_phone : undefined;
  const amount = typeof payload.amount === "number" ? payload.amount : undefined;
  const paymentProvider = typeof payload.payment_provider === "string" ? payload.payment_provider : undefined;
  const paymentStatus = typeof payload.payment_status === "string" ? payload.payment_status : undefined;
  const externalPaymentId = typeof payload.external_payment_id === "string" ? payload.external_payment_id : undefined;

  if (!packageId || !purchaserName || !purchaserEmail || amount === undefined || !paymentProvider || !externalPaymentId) {
    return NextResponse.json(
      {
        error:
          "Missing required field(s): package_id, purchaser_name, purchaser_email, amount, payment_provider, external_payment_id are all required",
      },
      { status: 400 },
    );
  }

  // Source of truth is the payment provider's own server-side confirmation,
  // not a frontend redirect -- a webhook delivered for a not-yet-successful
  // payment (pending, requires_action, failed) is acknowledged but not
  // processed, so nothing is created until the provider confirms funds.
  if (paymentStatus !== "succeeded" && paymentStatus !== "paid") {
    return NextResponse.json({ ok: true, skipped: true, reason: "payment not completed" });
  }

  const currency = typeof payload.currency === "string" ? payload.currency : "usd";
  const paymentReference = typeof payload.payment_reference === "string" ? payload.payment_reference : "";
  const externalCustomerId =
    typeof payload.external_customer_id === "string" ? payload.external_customer_id : undefined;
  const externalCheckoutSessionId =
    typeof payload.external_checkout_session_id === "string" ? payload.external_checkout_session_id : undefined;
  const purchasedAt = typeof payload.purchased_at === "string" ? payload.purchased_at : new Date().toISOString();

  const { data: resultRows, error: recordError } = await supabase.rpc("record_verified_partner_purchase", {
    p_owning_workspace_id: resolved.workspace_id,
    p_package_id: packageId,
    p_purchaser_name: purchaserName,
    p_purchaser_email: purchaserEmail,
    p_purchaser_phone: purchaserPhone ?? "",
    p_amount: amount,
    p_currency: currency,
    p_payment_provider: paymentProvider,
    p_payment_reference: paymentReference,
    p_external_payment_id: externalPaymentId,
    p_external_customer_id: externalCustomerId,
    p_external_checkout_session_id: externalCheckoutSessionId,
    p_purchased_at: purchasedAt,
  });

  if (recordError) {
    return NextResponse.json({ error: recordError.message }, { status: 400 });
  }

  const result = resultRows?.[0];
  return NextResponse.json({
    ok: true,
    did_process: result?.did_process ?? false,
    purchase_id: result?.purchase_id ?? null,
    onboarding_id: result?.onboarding_id ?? null,
    partner_prospect_id: result?.partner_prospect_id ?? null,
  });
}
