import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendEmailViaResend } from "@/lib/email/resend";
import { renderPortalInviteEmail } from "@/lib/email/portalInvite";
import { reportSystemFailure, isAccountLevelResendError } from "@/lib/systemFailures";
import { getAppUrl } from "@/lib/appUrl";

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

  const { data: jobs, error: queryError } = await supabase
    .from("pending_portal_invites")
    .select("id, workspace_id, client_id, client_portal_user_id")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (queryError) {
    console.error("send-pending-portal-invites: could not query pending_portal_invites", queryError);
    return NextResponse.json({ processed: 0, sent: 0, failed: 0, queryError: queryError.message }, { status: 200 });
  }

  console.log(`send-pending-portal-invites: fetched ${jobs?.length ?? 0} job(s)`, (jobs ?? []).map((j) => j.id));

  const context = await resolveInviteContext(supabase, jobs ?? []);

  let sent = 0;
  let failed = 0;

  for (const job of jobs ?? []) {
    const result = await sendOneWithTimeout(supabase, job, context);
    if (result === "sent") sent++;
    else failed++;
  }

  return NextResponse.json({ processed: jobs?.length ?? 0, sent, failed });
}

type PendingInviteJob = { id: string; workspace_id: string; client_id: string; client_portal_user_id: string };
type PortalUserRow = { id: string; invited_email: string; invited_name: string | null; invitation_token: string };
type WorkspaceRow = { id: string; name: string | null; phone: string | null; website: string | null; mailing_address: string | null; primary_contact_email: string | null };
type OrganizerResponseRow = { client_id: string; organizer_templates: { name?: string } | null };
type ConnectionRow = { child_workspace_id: string; parent_workspace_id: string; allows_branding_override: boolean };
type BrandingRow = { workspace_id: string; email_header_logo_url: string | null; logo_url: string | null };
type EmailTemplateRow = { workspace_id: string | null; subject: string; body_html: string };

type InviteContext = {
  portalUserById: Map<string, PortalUserRow>;
  workspaceById: Map<string, WorkspaceRow>;
  organizerNamesByClientId: Map<string, string[]>;
  connectionByChildWorkspaceId: Map<string, ConnectionRow>;
  brandingByWorkspaceId: Map<string, BrandingRow>;
  templateCandidates: EmailTemplateRow[];
};

// Every job independently re-fetched its own portal user, workspace,
// pending organizers, ERO connection, branding (up to twice), and the
// invite email template -- up to 7 queries per job, run one job at a time.
// Batches every one of those by the distinct ids actually present in this
// batch instead.
async function resolveInviteContext(supabase: ReturnType<typeof createServiceClient>, jobs: PendingInviteJob[]): Promise<InviteContext> {
  const portalUserIds = Array.from(new Set(jobs.map((j) => j.client_portal_user_id)));
  const workspaceIds = Array.from(new Set(jobs.map((j) => j.workspace_id)));
  const clientIds = Array.from(new Set(jobs.map((j) => j.client_id)));

  const [{ data: portalUsers }, { data: workspaces }, { data: organizerResponses }, { data: connections }] = await Promise.all([
    portalUserIds.length > 0
      ? supabase.from("client_portal_users").select("id, invited_email, invited_name, invitation_token").in("id", portalUserIds)
      : Promise.resolve({ data: [] as PortalUserRow[] }),
    workspaceIds.length > 0
      ? supabase.from("workspaces").select("id, name, phone, website, mailing_address, primary_contact_email").in("id", workspaceIds)
      : Promise.resolve({ data: [] as WorkspaceRow[] }),
    clientIds.length > 0
      ? supabase.from("organizer_responses").select("client_id, organizer_templates(name)").in("client_id", clientIds).neq("status", "completed")
      : Promise.resolve({ data: [] as OrganizerResponseRow[] }),
    workspaceIds.length > 0
      ? supabase
          .from("firm_connections")
          .select("child_workspace_id, parent_workspace_id, allows_branding_override")
          .in("child_workspace_id", workspaceIds)
          .eq("relationship_type", "ero_ptin")
          .eq("status", "active")
      : Promise.resolve({ data: [] as ConnectionRow[] }),
  ]);

  const connectionByChildWorkspaceId = new Map(
    (connections ?? []).filter((c): c is ConnectionRow & { child_workspace_id: string } => Boolean(c.child_workspace_id)).map((c) => [c.child_workspace_id, c])
  );

  // Branding can be needed for a job's own workspace, or (if it has an ERO
  // connection) the parent's workspace too -- collect the full set before
  // the one batched branding fetch.
  const brandingWorkspaceIds = new Set(workspaceIds);
  for (const connection of connections ?? []) brandingWorkspaceIds.add(connection.parent_workspace_id);

  const [{ data: brandingRows }, { data: templateCandidates }] = await Promise.all([
    supabase.from("branding").select("workspace_id, email_header_logo_url, logo_url").in("workspace_id", Array.from(brandingWorkspaceIds)),
    supabase
      .from("email_templates")
      .select("workspace_id, subject, body_html")
      .eq("slug", "portal-invite-email")
      .eq("status", "published")
      .or(`workspace_id.is.null,workspace_id.in.(${workspaceIds.join(",") || "00000000-0000-0000-0000-000000000000"})`),
  ]);

  const organizerNamesByClientId = new Map<string, string[]>();
  for (const row of organizerResponses ?? []) {
    const name = row.organizer_templates?.name;
    if (!name) continue;
    const list = organizerNamesByClientId.get(row.client_id) ?? [];
    list.push(name);
    organizerNamesByClientId.set(row.client_id, list);
  }

  return {
    portalUserById: new Map((portalUsers ?? []).map((p) => [p.id, p])),
    workspaceById: new Map((workspaces ?? []).map((w) => [w.id, w])),
    organizerNamesByClientId,
    connectionByChildWorkspaceId,
    brandingByWorkspaceId: new Map((brandingRows ?? []).map((b) => [b.workspace_id, b])),
    templateCandidates: templateCandidates ?? [],
  };
}

// A hung fetch to Resend (or any other await in sendOne) can otherwise stall
// this job forever without ever throwing -- the row just sits at 'pending'
// indefinitely and every future cron cycle re-fetches the same stuck row
// ahead of newer ones. Races sendOne against a hard deadline so a hang
// always turns into a real "failed" row instead of silent stagnation; the
// `.eq("status", "pending")` guard stops this from clobbering a real result
// if sendOne actually finishes just after the deadline.
async function sendOneWithTimeout(
  supabase: ReturnType<typeof createServiceClient>,
  job: PendingInviteJob,
  context: InviteContext,
  timeoutMs = 25000
): Promise<"sent" | "failed"> {
  let timedOut = false;
  const timer = new Promise<"failed">((resolve) => {
    setTimeout(() => {
      timedOut = true;
      resolve("failed");
    }, timeoutMs);
  });
  const result = await Promise.race([sendOne(supabase, job, context), timer]);
  if (timedOut) {
    console.error(`send-pending-portal-invites: job ${job.id} timed out after ${timeoutMs}ms`);
    await supabase
      .from("pending_portal_invites")
      .update({ status: "failed", error: `Timed out after ${timeoutMs}ms`, processed_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("status", "pending");
    await reportSystemFailure("send-pending-portal-invites", `Job ${job.id} timed out after ${timeoutMs}ms`, {
      workspaceId: job.workspace_id,
      context: { jobId: job.id },
    });
  }
  return result;
}

async function sendOne(supabase: ReturnType<typeof createServiceClient>, job: PendingInviteJob, context: InviteContext): Promise<"sent" | "failed"> {
  try {
    const portalUser = context.portalUserById.get(job.client_portal_user_id) ?? null;
    const workspace = context.workspaceById.get(job.workspace_id) ?? null;
    const organizerNames = context.organizerNamesByClientId.get(job.client_id) ?? [];
    const connection = context.connectionByChildWorkspaceId.get(job.workspace_id) ?? null;
    if (!portalUser) throw new Error("Portal invitation not found");

    // Same "whitelabeled by an ERO, optionally overridden by the PTIN's own
    // logo" resolution as getEffectiveBranding -- can't reuse that helper
    // directly here, since it needs an authenticated request's cookies and
    // this cron route runs under the service role with no request context.
    const brandingWorkspaceId = connection?.parent_workspace_id ?? job.workspace_id;
    const eroBranding = context.brandingByWorkspaceId.get(brandingWorkspaceId) ?? null;
    const ownBranding = connection?.allows_branding_override ? (context.brandingByWorkspaceId.get(job.workspace_id) ?? null) : null;
    const firmLogoUrl = ownBranding?.email_header_logo_url ?? ownBranding?.logo_url ?? eroBranding?.email_header_logo_url ?? eroBranding?.logo_url ?? null;

    const template =
      context.templateCandidates.find((t) => t.workspace_id === job.workspace_id) ?? context.templateCandidates.find((t) => t.workspace_id === null) ?? null;
    if (!template) throw new Error("Portal invite email template is missing");

    const acceptUrl = `${getAppUrl()}/portal/accept-invitation?token=${portalUser.invitation_token}`;

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
        assignedOrganizerNames: organizerNames,
        firmLogoUrl,
      }
    );

    const result = await sendEmailViaResend({ to: portalUser.invited_email, subject, html, sender: "portal", workspaceId: job.workspace_id });
    if (!result.sent) throw new Error(result.error ?? result.reason ?? "send failed");

    const { error: markSentErr } = await supabase
      .from("pending_portal_invites")
      .update({ status: "sent", processed_at: new Date().toISOString() })
      .eq("id", job.id);
    if (markSentErr) console.error(`send-pending-portal-invites: sent email for job ${job.id} but could not mark it sent`, markSentErr);
    return "sent";
  } catch (err) {
    const error = err instanceof Error ? err.message : "unknown error";
    const { error: markFailedErr } = await supabase
      .from("pending_portal_invites")
      .update({ status: "failed", error, processed_at: new Date().toISOString() })
      .eq("id", job.id);
    if (markFailedErr) console.error(`send-pending-portal-invites: job ${job.id} failed (${error}) and could not be marked failed`, markFailedErr);

    // A bad recipient address is something the workspace itself can fix
    // (correct the client's email on file) -- tell them, not platform IT.
    // Everything else here (missing template, missing env var, an
    // unexpected Resend/DB error) is a platform-side problem no workspace
    // admin can act on.
    if (isAccountLevelResendError(error)) {
      await supabase.rpc("notify_workspace_admins", {
        p_workspace_id: job.workspace_id,
        p_type: "PORTAL_INVITE_SEND_FAILED",
        p_template_key: "portal_invite_send_failed",
        p_payload: { error, client_id: job.client_id },
        p_channels: ["In-App"],
        p_priority: "Medium",
        p_entity_type: "client",
        p_entity_id: job.client_id,
      });
    } else {
      await reportSystemFailure("send-pending-portal-invites", error, { workspaceId: job.workspace_id, context: { jobId: job.id } });
    }
    return "failed";
  }
}
