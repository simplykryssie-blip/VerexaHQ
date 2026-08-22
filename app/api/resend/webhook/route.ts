import { NextResponse } from "next/server";
import { verifyResendSignature } from "@/lib/email/resend";
import { createServiceClient } from "@/lib/supabase/service";

// Resend delivers delivery/open/bounce events as svix-signed webhooks --
// see https://resend.com/docs/dashboard/webhooks/event-types. This closes
// the "Delivery Status" / "Open Tracking" gap on top of the existing
// email_log table rather than adding a new one.
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Resend webhooks are not configured for this environment." }, { status: 503 });
  }

  const payload = await request.text();
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature || !(await verifyResendSignature(payload, svixId, svixTimestamp, svixSignature, secret))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(payload) as { type: string; data: { email_id?: string } };
  const emailId = event.data.email_id;

  const supabase = createServiceClient();
  const { data: logRow } = await supabase
    .from("webhook_events")
    .insert({ provider: "resend", event_type: event.type, external_id: emailId, payload: event as never })
    .select("id")
    .single();

  if (emailId) {
    const now = new Date().toISOString();
    if (event.type === "email.delivered") {
      await supabase.from("email_log").update({ status: "delivered", delivered_at: now }).eq("provider_reference", emailId);
    } else if (event.type === "email.opened") {
      const { data: existing } = await supabase.from("email_log").select("open_count").eq("provider_reference", emailId).maybeSingle();
      await supabase
        .from("email_log")
        .update({ opened_at: now, open_count: (existing?.open_count ?? 0) + 1 })
        .eq("provider_reference", emailId);
    } else if (event.type === "email.clicked") {
      const { data: existing } = await supabase.from("email_log").select("click_count").eq("provider_reference", emailId).maybeSingle();
      await supabase
        .from("email_log")
        .update({ clicked_at: now, click_count: (existing?.click_count ?? 0) + 1 })
        .eq("provider_reference", emailId);
    } else if (event.type === "email.bounced" || event.type === "email.complained") {
      await supabase
        .from("email_log")
        .update({ status: "bounced", bounced_at: now, failed_reason: event.type })
        .eq("provider_reference", emailId);
    }
  }

  if (logRow) {
    await supabase.from("webhook_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("id", logRow.id);
  }

  return NextResponse.json({ received: true });
}
