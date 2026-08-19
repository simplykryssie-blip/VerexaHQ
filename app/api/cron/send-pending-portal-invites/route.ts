import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendEmailViaResend } from "@/lib/email/resend";
import { renderPortalInviteEmail } from "@/lib/email/portalInvite";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 20;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

// The "invite_to_portal" automation action can only create the
// client_portal_users row -- execute_automation_step is pure SQL and can't
// render/send an email. This drains that queue the same way
// send-pending-engagement-letters drains pending_engagement_letter_sends:
// reuses the exact same template lookup + renderer + sender the manual
// "Invite to portal" button already uses (app/api/portal-invitations/send-email),
// just from a service-role context instead of a signed-in staff member's request.
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: jobs } = await supabase
    .from("pending_portal_invites")
    .select("id, workspace_id, client_id, client_portal_user_id")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  let sent = 0;
  let failed = 0;

  for (const job of jobs ?? []) {
    const result = await sendOne(supabase, job);
    if (result === "sent") sent++;
    else failed++;
  }

  return NextResponse.json({ processed: jobs?.length ?? 0, sent, failed });
}

async function sendOne(
  supabase: ReturnType<typeof createServiceClient>,
  job: { id: string; workspace_id: string; client_id: string; client_portal_user_id: string }
): Promise<"sent" | "failed"> {
  try {
    const [{ data: portalUser }, { data: workspace }, { data: organizerResponses }] = await Promise.all([
      supabase.from("client_portal_users").select("invited_email, invited_name, invitation_token").eq("id", job.client_portal_user_id).single(),
      supabase.from("workspaces").select("name, phone, website, mailing_address, primary_contact_email").eq("id", job.workspace_id).single(),
      supabase.from("organizer_responses").select("status, organizer_templates(name)").eq("client_id", job.client_id).neq("status", "completed"),
    ]);
    if (!portalUser) throw new Error("Portal invitation not found");

    const { data: template } = await supabase
      .from("email_templates")
      .select("subject, body_html")
      .eq("slug", "portal-invite-email")
      .eq("status", "published")
      .or(`workspace_id.is.null,workspace_id.eq.${job.workspace_id}`)
      .order("workspace_id", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (!template) throw new Error("Portal invite email template is missing");

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL is not configured");
    const acceptUrl = `${appUrl}/portal/accept-invitation?token=${portalUser.invitation_token}`;

    const { subject, html } = renderPortalInviteEmail(
      { subject: template.subject, body: template.body_html },
      {
        clientFirstName: (portalUser.invited_name ?? "").trim().split(/\s+/)[0] ?? "",
        firmName: workspace?.name ?? "",
        firmPhone: workspace?.phone ?? null,
        firmEmail: workspace?.primary_contact_email ?? null,
        firmWebsite: workspace?.website ?? null,
        firmAddress: workspace?.mailing_address ?? null,
        portalActivationUrl: acceptUrl,
        assignedOrganizerNames: (organizerResponses ?? [])
          .map((o: { organizer_templates: { name?: string } | null }) => o.organizer_templates?.name)
          .filter((n): n is string => Boolean(n)),
      }
    );

    const result = await sendEmailViaResend({ to: portalUser.invited_email, subject, html, sender: "portal", workspaceId: job.workspace_id });
    if (!result.sent) throw new Error(result.error ?? result.reason ?? "send failed");

    await supabase.from("pending_portal_invites").update({ status: "sent", processed_at: new Date().toISOString() }).eq("id", job.id);
    return "sent";
  } catch (err) {
    const error = err instanceof Error ? err.message : "unknown error";
    await supabase.from("pending_portal_invites").update({ status: "failed", error, processed_at: new Date().toISOString() }).eq("id", job.id);
    return "failed";
  }
}
