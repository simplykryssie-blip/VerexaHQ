import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendEmailViaResend } from "@/lib/email/resend";
import { sendSmsViaTwilio } from "@/lib/sms/twilio";
import { renderTemplate } from "@/lib/templates/render";
import { recordProviderCheck } from "@/lib/providerHealth";
import { withJobLogging } from "@/lib/cron/withJobLogging";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 50;
const RETRY_BACKOFF_MINUTES = 5;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

// Drains notification_queue (Email/SMS jobs -- In-App/Portal/Push have no
// external provider, so they're marked sent immediately) and promotes any
// due scheduled messages out of draft_saves. Meant to be hit by a Vercel
// Cron job every few minutes; see vercel.json.
async function handleGET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const nowIso = new Date().toISOString();

  const { data: jobs } = await supabase
    .from("notification_queue")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(BATCH_SIZE);

  const resolved = await resolveDispatchContext(supabase, jobs ?? []);

  let sent = 0;
  let failed = 0;
  let deadLettered = 0;

  for (const job of jobs ?? []) {
    const result = await dispatchOne(supabase, job, resolved);
    if (result === "sent") sent++;
    else if (result === "dead") deadLettered++;
    else failed++;
  }

  const { data: dueDrafts } = await supabase
    .from("draft_saves")
    .select("*")
    .eq("draft_type", "message")
    .lte("payload->>scheduled_at", nowIso);

  let messagesPromoted = 0;
  for (const draft of dueDrafts ?? []) {
    const payload = draft.payload as {
      thread_id?: string;
      body?: string;
      sender_type?: string;
      is_internal?: boolean;
    };
    if (!payload.thread_id || !payload.body) continue;

    await supabase.from("messages").insert({
      workspace_id: draft.workspace_id,
      thread_id: payload.thread_id,
      sender_type: payload.sender_type ?? "staff",
      sender_id: draft.user_id,
      body: payload.body,
      is_internal: payload.is_internal ?? false,
    });
    await supabase.from("draft_saves").delete().eq("id", draft.id);
    messagesPromoted++;
  }

  return NextResponse.json({ processed: jobs?.length ?? 0, sent, failed, deadLettered, messagesPromoted });
}

type NotificationJob = {
  id: string;
  workspace_id: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  channel: string;
  template_key: string;
  payload: unknown;
  attempts: number;
  max_attempts: number;
  entity_type: string | null;
  entity_id: string | null;
};

type EmailTemplateCandidate = { workspace_id: string | null; subject: string; body_html: string };
type SmsTemplateCandidate = { workspace_id: string | null; body: string };
type PortalInvite = { invitation_token: string; token_expires_at: string | null; invited_at: string | null };

type DispatchContext = {
  engagementClientId: Map<string, string | null>;
  portalInviteByClientId: Map<string, PortalInvite | null>;
  emailTemplatesBySlug: Map<string, EmailTemplateCandidate[]>;
  smsTemplatesBySlug: Map<string, SmsTemplateCandidate[]>;
};

// Every job independently re-resolves the same handful of lookups
// (engagement -> client, client -> portal invite, template by slug) --
// batches them all once per cron tick instead of once per job.
async function resolveDispatchContext(supabase: ReturnType<typeof createServiceClient>, jobs: NotificationJob[]): Promise<DispatchContext> {
  const engagementIds = Array.from(new Set(jobs.filter((j) => j.entity_type === "engagement" && j.entity_id).map((j) => j.entity_id as string)));
  const { data: engagements } =
    engagementIds.length > 0
      ? await supabase.from("engagements").select("id, client_id").in("id", engagementIds)
      : { data: [] as { id: string; client_id: string | null }[] };
  const engagementClientId = new Map((engagements ?? []).map((e) => [e.id, e.client_id]));

  const clientIds = Array.from(
    new Set(
      jobs
        .map((j) => (j.entity_type === "client" ? j.entity_id : j.entity_type === "engagement" ? engagementClientId.get(j.entity_id ?? "") : null))
        .filter((id): id is string => Boolean(id))
    )
  );
  const { data: invites } =
    clientIds.length > 0
      ? await supabase
          .from("client_portal_users")
          .select("client_id, invitation_token, token_expires_at, invited_at")
          .in("client_id", clientIds)
          .eq("status", "invited")
          .order("invited_at", { ascending: false })
      : { data: [] as { client_id: string; invitation_token: string; token_expires_at: string | null; invited_at: string | null }[] };
  const portalInviteByClientId = new Map<string, PortalInvite | null>();
  for (const invite of invites ?? []) {
    if (!portalInviteByClientId.has(invite.client_id)) portalInviteByClientId.set(invite.client_id, invite);
  }

  const workspaceIds = Array.from(new Set(jobs.map((j) => j.workspace_id).filter((id): id is string => Boolean(id))));
  const emailSlugs = Array.from(new Set(jobs.filter((j) => j.channel === "Email").map((j) => j.template_key)));
  const smsSlugs = Array.from(new Set(jobs.filter((j) => j.channel === "SMS").map((j) => j.template_key)));

  const [{ data: emailRows }, { data: smsRows }] = await Promise.all([
    emailSlugs.length > 0
      ? supabase
          .from("email_templates")
          .select("slug, workspace_id, subject, body_html")
          .in("slug", emailSlugs)
          .eq("status", "published")
          .or(`workspace_id.is.null,workspace_id.in.(${workspaceIds.join(",") || "00000000-0000-0000-0000-000000000000"})`)
      : Promise.resolve({ data: [] as { slug: string; workspace_id: string | null; subject: string; body_html: string }[] }),
    smsSlugs.length > 0
      ? supabase
          .from("sms_templates")
          .select("slug, workspace_id, body")
          .in("slug", smsSlugs)
          .eq("status", "published")
          .or(`workspace_id.is.null,workspace_id.in.(${workspaceIds.join(",") || "00000000-0000-0000-0000-000000000000"})`)
      : Promise.resolve({ data: [] as { slug: string; workspace_id: string | null; body: string }[] }),
  ]);

  const emailTemplatesBySlug = new Map<string, EmailTemplateCandidate[]>();
  for (const row of emailRows ?? []) {
    const list = emailTemplatesBySlug.get(row.slug) ?? [];
    list.push(row);
    emailTemplatesBySlug.set(row.slug, list);
  }
  const smsTemplatesBySlug = new Map<string, SmsTemplateCandidate[]>();
  for (const row of smsRows ?? []) {
    const list = smsTemplatesBySlug.get(row.slug) ?? [];
    list.push(row);
    smsTemplatesBySlug.set(row.slug, list);
  }

  return { engagementClientId, portalInviteByClientId, emailTemplatesBySlug, smsTemplatesBySlug };
}

function resolveClientIdFromContext(context: DispatchContext, entityType: string | null, entityId: string | null) {
  if (!entityId) return null;
  if (entityType === "client") return entityId;
  if (entityType === "engagement") return context.engagementClientId.get(entityId) ?? null;
  return null;
}

// portal_link always resolves (a generic sign-in page, no dependency on an
// invite existing). portal_invite_link only resolves when the client has a
// live, unexpired invitation -- callers must refuse to send a message that
// references it otherwise, rather than sending a blank/broken link.
function resolvePortalMergeFieldsFromContext(context: DispatchContext, clientId: string | null) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const portalLink = `${appUrl}/portal/login`;
  if (!clientId) return { portalLink, portalInviteLink: null as string | null };

  const invite = context.portalInviteByClientId.get(clientId) ?? null;
  const isLive = invite && (!invite.token_expires_at || new Date(invite.token_expires_at) > new Date());
  return {
    portalLink,
    portalInviteLink: isLive ? `${appUrl}/portal/accept-invitation?token=${invite.invitation_token}` : null,
  };
}

function pickTemplate<T extends { workspace_id: string | null }>(candidates: T[] | undefined, workspaceId: string | null): T | null {
  if (!candidates || candidates.length === 0) return null;
  return candidates.find((c) => c.workspace_id === workspaceId) ?? candidates.find((c) => c.workspace_id === null) ?? null;
}

async function dispatchOne(supabase: ReturnType<typeof createServiceClient>, job: NotificationJob, context: DispatchContext): Promise<"sent" | "retry" | "dead"> {
  const basePayload = (job.payload ?? {}) as Record<string, unknown>;
  const workspaceId = job.workspace_id;

  try {
    const clientId = resolveClientIdFromContext(context, job.entity_type, job.entity_id);
    const { portalLink, portalInviteLink } = resolvePortalMergeFieldsFromContext(context, clientId);
    const payload: Record<string, unknown> = { ...basePayload, portal_link: portalLink };
    if (portalInviteLink) payload.portal_invite_link = portalInviteLink;

    if (job.channel === "Email") {
      if (!job.recipient_email) throw new Error("Job has no recipient_email");
      if (!workspaceId) throw new Error("Job has no workspace_id");
      const template = pickTemplate(context.emailTemplatesBySlug.get(job.template_key), workspaceId);
      if (!template) throw new Error(`No published email template for key "${job.template_key}"`);
      if (!portalInviteLink && referencesToken(template.subject + template.body_html, "portal_invite_link")) {
        throw new Error("This template uses the portal invite link, but no active, unexpired invitation exists for this client. Send a portal invite first, then retry.");
      }

      const subject = renderTemplate(template.subject, payload);
      const html = renderTemplate(template.body_html, payload);
      const result = await sendEmailViaResend({ to: job.recipient_email, subject, html, workspaceId });
      if (result.reason === undefined) await recordProviderCheck("email", result.sent, result.error);

      await supabase.from("email_log").insert({
        workspace_id: workspaceId,
        notification_queue_id: job.id,
        template_key: job.template_key,
        recipient_email: job.recipient_email,
        subject,
        status: result.sent ? "sent" : "failed",
        provider_reference: result.id ?? null,
        sent_at: result.sent ? new Date().toISOString() : null,
        failed_reason: result.sent ? null : (result.error ?? result.reason ?? null),
      });
      if (!result.sent) throw new Error(result.error ?? result.reason ?? "send failed");
    } else if (job.channel === "SMS") {
      if (!job.recipient_phone) throw new Error("Job has no recipient_phone");
      if (!workspaceId) throw new Error("Job has no workspace_id");
      const template = pickTemplate(context.smsTemplatesBySlug.get(job.template_key), workspaceId);
      if (!template) throw new Error(`No published SMS template for key "${job.template_key}"`);
      if (!portalInviteLink && referencesToken(template.body, "portal_invite_link")) {
        throw new Error("This template uses the portal invite link, but no active, unexpired invitation exists for this client. Send a portal invite first, then retry.");
      }

      const body = renderTemplate(template.body, payload);
      const result = await sendSmsViaTwilio({ to: job.recipient_phone, body, workspaceId });
      if (result.reason === undefined) await recordProviderCheck("sms", result.sent, result.error);

      await supabase.from("sms_log").insert({
        workspace_id: workspaceId,
        notification_queue_id: job.id,
        template_key: job.template_key,
        recipient_phone: job.recipient_phone,
        body,
        status: result.sent ? "sent" : "failed",
        provider_reference: result.id ?? null,
        sent_at: result.sent ? new Date().toISOString() : null,
        failed_reason: result.sent ? null : (result.error ?? result.reason ?? null),
      });
      if (!result.sent) throw new Error(result.error ?? result.reason ?? "send failed");
    }
    // In-App / Portal / Push have no external provider -- the row itself
    // is the delivery surface (a future notifications inbox reads
    // notification_queue directly), so reaching here is success.

    await supabase.from("notification_queue").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", job.id);
    return "sent";
  } catch (err) {
    const attempts = job.attempts + 1;
    const error = err instanceof Error ? err.message : "unknown error";
    if (attempts >= job.max_attempts) {
      await supabase.from("notification_queue").update({ status: "failed", attempts, error }).eq("id", job.id);
      return "dead";
    }
    await supabase
      .from("notification_queue")
      .update({
        attempts,
        error,
        scheduled_at: new Date(Date.now() + attempts * RETRY_BACKOFF_MINUTES * 60_000).toISOString(),
      })
      .eq("id", job.id);
    return "retry";
  }
}

function referencesToken(template: string, token: string) {
  return new RegExp(`\\{\\{\\s*${token}\\s*\\}\\}`).test(template);
}

export const GET = withJobLogging("dispatch-notifications", handleGET);
