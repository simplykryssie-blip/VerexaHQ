import { NextResponse } from "next/server";
import { buildZoomCrcResponse, verifyZoomWebhookSignature } from "@/lib/zoom/client";
import { createServiceClient } from "@/lib/supabase/service";

// P16-03/P16-05;P18-07: signature verification alone proves the request
// was signed with the real secret at some point -- it doesn't prove it
// wasn't captured and replayed later. Zoom's x-zm-request-timestamp is
// milliseconds since epoch; reject anything outside a 5-minute window
// (matching claim_stripe_webhook_event's own retry/staleness tolerance
// elsewhere in this app) before trusting the event at all.
const MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;

export async function POST(request: Request) {
  const secret = process.env.ZOOM_WEBHOOK_SECRET_TOKEN;
  if (!secret) {
    return NextResponse.json({ error: "Zoom is not configured for this environment." }, { status: 503 });
  }

  const rawBody = await request.text();
  const timestamp = request.headers.get("x-zm-request-timestamp");
  const signature = request.headers.get("x-zm-signature");
  if (!timestamp || !signature || !(await verifyZoomWebhookSignature(rawBody, timestamp, signature, secret))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const timestampMs = Number(timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > MAX_TIMESTAMP_SKEW_MS) {
    return NextResponse.json({ error: "Request timestamp is stale" }, { status: 401 });
  }

  const event = JSON.parse(rawBody) as {
    event: string;
    payload: Record<string, unknown>;
  };

  if (event.event === "endpoint.url_validation") {
    const plainToken = event.payload.plainToken as string;
    const response = await buildZoomCrcResponse(plainToken, secret);
    return NextResponse.json(response);
  }

  if (event.event === "app_deauthorized") {
    const zoomUserId = event.payload.user_id as string | undefined;
    const supabase = createServiceClient();

    // Dedup on event+user+timestamp: a genuine replay of this exact
    // captured delivery carries the same timestamp and is skipped; a real
    // new deauthorization (even for the same user) carries a new one and
    // still processes.
    const { data: claim, error: claimError } = await supabase
      .rpc("claim_provider_webhook_event", {
        p_provider: "zoom",
        p_event_id: `${event.event}:${zoomUserId ?? ""}:${timestamp}`,
        p_event_type: event.event,
        p_payload: event as never,
      })
      .single();

    if (!claimError && claim && !claim.should_process) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    if (zoomUserId) {
      await supabase.from("user_zoom_connections").update({ status: "revoked" }).eq("zoom_user_id", zoomUserId);
    }
  }

  return NextResponse.json({ received: true });
}
