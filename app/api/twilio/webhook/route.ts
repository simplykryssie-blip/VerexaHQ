import { NextResponse } from "next/server";
import { verifyTwilioSignature } from "@/lib/sms/twilio";
import { createServiceClient } from "@/lib/supabase/service";

// Twilio status callbacks arrive as form-encoded POSTs signed via
// X-Twilio-Signature -- see
// https://www.twilio.com/docs/usage/webhooks/webhooks-security. Closes the
// "Delivery Status" gap for SMS on top of the existing sms_log table.
export async function POST(request: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    return NextResponse.json({ error: "Twilio webhooks are not configured for this environment." }, { status: 503 });
  }

  const formData = await request.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => {
    params[key] = String(value);
  });

  const signature = request.headers.get("x-twilio-signature");
  if (!signature || !(await verifyTwilioSignature(request.url, params, signature, authToken))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const messageSid = params.MessageSid;
  const status = params.MessageStatus;

  const supabase = createServiceClient();
  const { data: logRow } = await supabase
    .from("webhook_events")
    .insert({ provider: "twilio", event_type: status ?? "unknown", external_id: messageSid, payload: params as never })
    .select("id")
    .single();

  if (messageSid && status) {
    const now = new Date().toISOString();
    if (status === "delivered") {
      await supabase.from("sms_log").update({ status: "delivered", delivered_at: now }).eq("provider_reference", messageSid);
    } else if (status === "failed" || status === "undelivered") {
      await supabase
        .from("sms_log")
        .update({ status, failed_reason: params.ErrorMessage ?? params.ErrorCode ?? null })
        .eq("provider_reference", messageSid);
    }
  }

  if (logRow) {
    await supabase.from("webhook_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", logRow.id);
  }

  return NextResponse.json({ received: true });
}
