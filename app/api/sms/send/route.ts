import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendSmsViaTwilio } from "@/lib/sms/twilio";
import { recordProviderCheck } from "@/lib/providerHealth";
import { checkRateLimit } from "@/lib/rateLimit";
import { getCurrentWorkspace, workspaceOperationalError, isWorkspaceStatusOperational } from "@/lib/workspace";

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, sent: false, error: "Not authenticated" }, { status: 401 });
  }

  const allowed = await checkRateLimit(`sms-send:${user.id}`, 20, 60);
  if (!allowed) {
    return NextResponse.json({ ok: false, sent: false, error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const { to, body, clientId } = (await request.json()) as { to?: string; body?: string; clientId?: string };
  if (!to || !body) {
    return NextResponse.json({ ok: false, sent: false, error: "to and body are required" }, { status: 400 });
  }

  const workspace = await getCurrentWorkspace();
  if (workspace && !isWorkspaceStatusOperational(workspace.status)) {
    return NextResponse.json({ ok: false, sent: false, error: workspaceOperationalError(workspace) }, { status: 403 });
  }
  const result = await sendSmsViaTwilio({ to, body, ...(workspace ? { workspaceId: workspace.id } : {}), ...(clientId ? { clientId } : {}) });
  if (result.reason === undefined) {
    await recordProviderCheck("sms", result.sent, result.error);
  }

  // P09-05: without this row, Twilio's delivery/failure status callback
  // (which correlates by provider_reference against sms_log) has nothing
  // to match a staff-initiated direct send against -- the event is
  // silently dropped. Only possible when there's a workspace to attribute
  // it to; RLS (sms_log_write, has_permission(workspace_id, 'messages.send'))
  // already gates this the same way a queued send is gated.
  if (workspace && result.reason === undefined) {
    await supabase.from("sms_log").insert({
      workspace_id: workspace.id,
      recipient_phone: to,
      body,
      status: result.sent ? "sent" : "failed",
      provider_reference: result.id ?? null,
      sent_at: result.sent ? new Date().toISOString() : null,
      failed_reason: result.sent ? null : (result.error ?? null),
    });
  }

  return NextResponse.json({ ok: true, ...result });
}
