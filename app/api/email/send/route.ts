import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace, workspaceOperationalError, isWorkspaceStatusOperational } from "@/lib/workspace";
import { sendEmailViaResend, SYSTEM_SENDERS, type SystemSenderKey } from "@/lib/email/resend";
import { recordProviderCheck } from "@/lib/providerHealth";
import { checkRateLimit } from "@/lib/rateLimit";

function isSystemSenderKey(value: unknown): value is SystemSenderKey {
  return typeof value === "string" && value in SYSTEM_SENDERS;
}

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, sent: false, error: "Not authenticated" }, { status: 401 });
  }

  const allowed = await checkRateLimit(`email-send:${user.id}`, 30, 60);
  if (!allowed) {
    return NextResponse.json({ ok: false, sent: false, error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const { to, subject, html, sender } = (await request.json()) as {
    to?: string;
    subject?: string;
    html?: string;
    sender?: string;
  };
  if (!to || !subject || !html) {
    return NextResponse.json({ ok: false, sent: false, error: "to, subject, and html are required" }, { status: 400 });
  }

  const workspace = await getCurrentWorkspace();
  if (workspace && !isWorkspaceStatusOperational(workspace.status)) {
    return NextResponse.json({ ok: false, sent: false, error: workspaceOperationalError(workspace) }, { status: 403 });
  }
  const { data: profile } = await supabase.from("user_profiles").select("display_name").eq("id", user.id).maybeSingle();

  const result = await sendEmailViaResend({
    to,
    subject,
    html,
    ...(isSystemSenderKey(sender) ? { sender } : {}),
    ...(workspace ? { workspaceId: workspace.id } : {}),
    ...(profile?.display_name ? { fromName: profile.display_name } : {}),
  });
  if (result.reason === undefined) {
    await recordProviderCheck("email", result.sent, result.error);
  }

  // P09-05: without this row, Resend's delivery/bounce webhook (which
  // correlates by provider_reference against email_log) has nothing to
  // match a staff-initiated direct send against -- the event is silently
  // dropped. Only possible when there's a workspace to attribute it to;
  // RLS (email_log_write, has_permission(workspace_id, 'messages.send'))
  // already gates this the same way a queued send is gated.
  if (workspace && result.reason === undefined) {
    await supabase.from("email_log").insert({
      workspace_id: workspace.id,
      recipient_email: to,
      subject,
      status: result.sent ? "sent" : "failed",
      provider_reference: result.id ?? null,
      sent_at: result.sent ? new Date().toISOString() : null,
      failed_reason: result.sent ? null : (result.error ?? null),
    });
  }

  return NextResponse.json({ ok: true, ...result });
}
