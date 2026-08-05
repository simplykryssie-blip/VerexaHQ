import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendEmailViaResend } from "@/lib/email/resend";
import { sendSmsViaTwilio } from "@/lib/sms/twilio";
import { renderTemplate } from "@/lib/templates/render";
import { recordProviderCheck } from "@/lib/providerHealth";

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
export async function GET(request: Request) {
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

  let sent = 0;
  let failed = 0;
  let deadLettered = 0;

  for (const job of jobs ?? []) {
    const result = await dispatchOne(supabase, job);
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

async function dispatchOne(
  supabase: ReturnType<typeof createServiceClient>,
  job: {
    id: string;
    workspace_id: string | null;
    recipient_email: string | null;
    recipient_phone: string | null;
    channel: string;
    template_key: string;
    payload: unknown;
    attempts: number;
    max_attempts: number;
  }
): Promise<"sent" | "retry" | "dead"> {
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  const workspaceId = job.workspace_id;

  try {
    if (job.channel === "Email") {
      if (!job.recipient_email) throw new Error("Job has no recipient_email");
      if (!workspaceId) throw new Error("Job has no workspace_id");
      const template = await findEmailTemplate(supabase, workspaceId, job.template_key);
      if (!template) throw new Error(`No published email template for key "${job.template_key}"`);

      const subject = renderTemplate(template.subject, payload);
      const html = renderTemplate(template.body_html, payload);
      const result = await sendEmailViaResend({ to: job.recipient_email, subject, html });
      if (result.reason === undefined) await recordProviderCheck("email", result.sent, result.error);

      await supabase.from("email_log").insert({
        workspace_id: workspaceId,
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
      const template = await findSmsTemplate(supabase, workspaceId, job.template_key);
      if (!template) throw new Error(`No published SMS template for key "${job.template_key}"`);

      const body = renderTemplate(template.body, payload);
      const result = await sendSmsViaTwilio({ to: job.recipient_phone, body });
      if (result.reason === undefined) await recordProviderCheck("sms", result.sent, result.error);

      await supabase.from("sms_log").insert({
        workspace_id: workspaceId,
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

async function findEmailTemplate(supabase: ReturnType<typeof createServiceClient>, workspaceId: string, slug: string) {
  const { data } = await supabase
    .from("email_templates")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
    .order("workspace_id", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function findSmsTemplate(supabase: ReturnType<typeof createServiceClient>, workspaceId: string, slug: string) {
  const { data } = await supabase
    .from("sms_templates")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
    .order("workspace_id", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return data;
}
