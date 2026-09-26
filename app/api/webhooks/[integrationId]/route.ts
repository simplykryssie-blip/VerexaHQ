import { NextResponse } from "next/server";
import { verifyStripeSignature } from "@/lib/stripe/client";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// Generic, provider-agnostic inbound webhook endpoint (Task #3/#4/#5). The
// integration id in the URL path is a lookup key only -- it never grants
// anything by itself. Every request must also carry a valid signature
// computed with that integration's own signing_secret (workspace_id/
// provider are resolved server-side from the integration row, never taken
// from the request body), so this never trusts a caller-supplied
// workspace_id the way a naive webhook endpoint would.
//
// Both supported providers use the exact same HMAC scheme (Stripe's own
// `t=<unix ts>,v1=<hex hmac-sha256 of "timestamp.body">` format, verified
// via verifyStripeSignature) -- for 'stripe' that's Stripe's real signature
// header against a workspace's own Stripe webhook signing secret; for
// 'generic' it's the same scheme self-issued, so any system capable of
// HMAC-signing a request the way Stripe does can point at this endpoint
// too, rather than inventing a second verification scheme.
export async function POST(request: Request, { params }: { params: Promise<{ integrationId: string }> }) {
  const { integrationId } = await params;
  const supabase = createServiceClient();

  const { data: integration } = await supabase
    .from("webhook_integrations")
    .select("id, provider, signing_secret, status")
    .eq("id", integrationId)
    .maybeSingle();

  if (!integration || integration.status !== "active") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rawBody = await request.text();
  const signatureHeader = request.headers.get(integration.provider === "stripe" ? "stripe-signature" : "x-webhook-signature");
  if (!signatureHeader || !(await verifyStripeSignature(rawBody, signatureHeader, integration.signing_secret))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON" }, { status: 400 });
  }

  let eventType: string | undefined;
  let externalId: string | undefined;
  let isTest = false;

  if (integration.provider === "stripe") {
    // The verified Stripe event is authoritative -- these fields come from
    // the JSON body Stripe itself signed, never from any client-asserted
    // header or query param.
    eventType = typeof payload.type === "string" ? payload.type : undefined;
    externalId = typeof payload.id === "string" ? payload.id : undefined;
    isTest = payload.livemode === false;
  } else {
    eventType = typeof payload.event_type === "string" ? payload.event_type : undefined;
    externalId = typeof payload.id === "string" ? payload.id : typeof payload.event_id === "string" ? (payload.event_id as string) : undefined;
    isTest = request.headers.get("x-webhook-test-mode") === "true";
  }

  if (!eventType) {
    return NextResponse.json({ error: integration.provider === "stripe" ? "Missing event type" : "Payload must include an \"event_type\" field" }, { status: 400 });
  }

  const { data: claim, error: claimError } = await supabase
    .rpc("claim_webhook_event", {
      p_integration_id: integration.id,
      p_event_type: eventType,
      p_external_id: (externalId ?? null) as never,
      p_payload: payload as never,
      p_is_test: isTest,
    })
    .single();

  if (claimError) {
    return NextResponse.json({ error: "Could not record webhook event" }, { status: 500 });
  }
  if (!claim?.should_process) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    await supabase.rpc("fire_webhook_automations", {
      p_integration_id: integration.id,
      p_event_type: eventType,
      p_payload: payload as never,
      p_is_test: isTest,
    });
    await supabase.rpc("mark_webhook_event_processed", { p_event_id: claim.id, p_status: "processed" });
  } catch (err) {
    await supabase.rpc("mark_webhook_event_processed", {
      p_event_id: claim.id,
      p_status: "failed",
      p_error: err instanceof Error ? err.message : "unknown error",
    });
    return NextResponse.json({ error: "Failed to process webhook event" }, { status: 500 });
  }

  return NextResponse.json({ received: true, is_test: isTest });
}
