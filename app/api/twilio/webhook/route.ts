import { NextResponse } from "next/server";
import { verifyTwilioSignature } from "@/lib/sms/twilio";
import { createServiceClient } from "@/lib/supabase/service";

// Twilio status callbacks and inbound messages both arrive as
// form-encoded POSTs signed via X-Twilio-Signature to this same URL --
// see https://www.twilio.com/docs/usage/webhooks/webhooks-security. A
// status callback always carries MessageStatus; an inbound message
// ("a message comes in") never does, so that's how the two are told
// apart below.
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

  if (!status) {
    await handleInboundMessage(supabase, params, messageSid);
    return NextResponse.json({ received: true });
  }

  const { data: logRow } = await supabase
    .from("webhook_events")
    .insert({ provider: "twilio", event_type: status, external_id: messageSid, payload: params as never })
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

function last10Digits(phone: string | null | undefined) {
  return (phone ?? "").replace(/\D/g, "").slice(-10);
}

// Everyone in this account sends SMS from the same shared
// TWILIO_FROM_NUMBER (no per-workspace numbers), so a reply's From
// number resolves to a client by digits alone -- ambiguous only if the
// same phone number happens to be a client in more than one workspace,
// in which case the most recent outbound text to that number (sms_log)
// decides which workspace this reply belongs to. No confident match
// leaves the payload logged to webhook_events for visibility rather
// than guessing.
//
// Landing the reply as an ordinary 'client'-sent row in messages is
// deliberate -- fire_client_message_received_automations already fires
// client_message.received on any such insert, so this doesn't need (or
// want) its own separate trigger type.
async function handleInboundMessage(
  supabase: ReturnType<typeof createServiceClient>,
  params: Record<string, string>,
  messageSid: string | undefined
) {
  const from = params.From;
  const body = params.Body ?? "";
  if (!from || !messageSid) return;

  const { data: existing } = await supabase.from("messages").select("id").eq("external_source", "twilio").eq("external_id", messageSid).maybeSingle();
  if (existing) return;

  const digits = last10Digits(from);
  if (!digits) return;

  const { data: clientMatches } = await supabase
    .from("clients")
    .select("id, workspace_id")
    .ilike("normalized_phone", `%${digits}`)
    .is("merged_into_client_id", null);

  let resolved: { workspaceId: string; clientId: string } | null = null;
  if (clientMatches && clientMatches.length === 1) {
    resolved = { workspaceId: clientMatches[0].workspace_id, clientId: clientMatches[0].id };
  } else if (clientMatches && clientMatches.length > 1) {
    const { data: recentSms } = await supabase
      .from("sms_log")
      .select("workspace_id, recipient_phone")
      .order("created_at", { ascending: false })
      .limit(200);
    const match = (recentSms ?? []).find((r) => last10Digits(r.recipient_phone) === digits);
    if (match) {
      const workspaceMatch = clientMatches.find((c) => c.workspace_id === match.workspace_id);
      if (workspaceMatch) resolved = { workspaceId: workspaceMatch.workspace_id, clientId: workspaceMatch.id };
    }
  }

  if (!resolved) {
    await supabase
      .from("webhook_events")
      .insert({ provider: "twilio", event_type: "inbound_unresolved", external_id: messageSid, payload: params as never });
    return;
  }

  const { data: thread } = await supabase
    .from("message_threads")
    .select("id")
    .eq("workspace_id", resolved.workspaceId)
    .eq("entity_type", "client")
    .eq("entity_id", resolved.clientId)
    .eq("channel", "sms")
    .eq("status", "open")
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let threadId = thread?.id as string | undefined;
  if (!threadId) {
    const { data: newThread } = await supabase
      .from("message_threads")
      .insert({ workspace_id: resolved.workspaceId, entity_type: "client", entity_id: resolved.clientId, channel: "sms", subject: "Text messages" })
      .select("id")
      .single();
    threadId = newThread?.id;
  }
  if (!threadId) return;

  await supabase.from("messages").insert({
    workspace_id: resolved.workspaceId,
    thread_id: threadId,
    sender_type: "client",
    is_internal: false,
    body,
    external_source: "twilio",
    external_id: messageSid,
  });

  await supabase.from("message_threads").update({ last_message_at: new Date().toISOString() }).eq("id", threadId);
}
