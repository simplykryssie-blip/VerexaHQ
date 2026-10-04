import { NextResponse } from "next/server";
import { verifyResendSignature } from "@/lib/email/resend";
import { createServiceClient } from "@/lib/supabase/service";
import { markWebhookProcessed } from "@/lib/stripe/handleCheckoutCompleted";

// P16-03/P16-05;P18-07: svix-timestamp is Unix seconds; reject anything
// outside a 5-minute window before trusting the event (same tolerance as
// claim_stripe_webhook_event and the Zoom webhook's own freshness check).
const MAX_TIMESTAMP_SKEW_SECONDS = 5 * 60;

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

  const timestampSeconds = Number(svixTimestamp);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > MAX_TIMESTAMP_SKEW_SECONDS) {
    return NextResponse.json({ error: "Request timestamp is stale" }, { status: 400 });
  }

  const event = JSON.parse(payload) as { type: string; data: { email_id?: string } };
  const emailId = event.data.email_id;

  const supabase = createServiceClient();

  // Atomic claim/dedup, generalizing the same pattern claim_stripe_webhook_event
  // already established -- svixId is always present (unlike emailId, which
  // some event types omit) so dedup here is never skipped. A duplicate/
  // retried delivery comes back should_process: false and is safely
  // ignored rather than reprocessed (double-incrementing open/click counts).
  const { data: claim, error: claimError } = await supabase
    .rpc("claim_provider_webhook_event", {
      p_provider: "resend",
      p_event_id: emailId ?? svixId,
      p_event_type: event.type,
      p_payload: event as never,
    })
    .single();

  if (claimError) {
    return NextResponse.json({ error: "Could not record webhook event" }, { status: 500 });
  }
  if (!claim?.should_process) {
    return NextResponse.json({ received: true, duplicate: true });
  }
  const logRow = { id: claim.id };

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

  await markWebhookProcessed(supabase, logRow.id, undefined);

  return NextResponse.json({ received: true });
}
