import { NextResponse } from "next/server";
import { buildZoomCrcResponse, verifyZoomWebhookSignature } from "@/lib/zoom/client";
import { createServiceClient } from "@/lib/supabase/service";

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
    if (zoomUserId) {
      const supabase = createServiceClient();
      await supabase.from("user_zoom_connections").update({ status: "revoked" }).eq("zoom_user_id", zoomUserId);
    }
  }

  return NextResponse.json({ received: true });
}
