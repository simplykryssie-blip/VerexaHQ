import { isEmailConfigured } from "@/lib/providerStatus";
import { createServiceClient } from "@/lib/supabase/service";

export const SYSTEM_SENDERS = {
  noreply: "noreply@verexahq.com",
  support: "support@verexahq.com",
  billing: "billing@verexahq.com",
  notifications: "notifications@verexahq.com",
  team: "team@verexahq.com",
  portal: "portal@verexahq.com",
} as const;

export type SystemSenderKey = keyof typeof SYSTEM_SENDERS;

export type SendEmailResult = { sent: boolean; reason?: string; error?: string; id?: string };

export async function sendEmailViaResend({
  to,
  subject,
  html,
  sender = "noreply",
  fromName,
  replyTo,
  workspaceId,
  domainId,
}: {
  to: string;
  subject: string;
  html: string;
  sender?: SystemSenderKey;
  fromName?: string;
  replyTo?: string;
  workspaceId?: string;
  domainId?: string;
}): Promise<SendEmailResult> {
  if (!isEmailConfigured()) {
    return { sent: false, reason: "Email provider is not configured for this environment." };
  }

  const supabase = createServiceClient();

  // Draws one unit from the workspace's free bucket, then its prepaid
  // balance -- a workspace never granted either (not on a paid plan) passes
  // through unmetered. Reserved before the actual send so nothing goes out
  // unpaid; refunded below if the send itself fails.
  let reservedSource: string | null = null;
  if (workspaceId) {
    const { data: reservation } = await supabase.rpc("reserve_usage_unit", { p_workspace_id: workspaceId, p_resource_type: "email" }).single();
    if (!reservation?.allowed) {
      return { sent: false, reason: "This workspace's email balance is used up. Purchase a top-up to keep sending." };
    }
    reservedSource = reservation.source;
  }

  let fromAddress = process.env.EMAIL_FROM_ADDRESS || SYSTEM_SENDERS[sender];

  // A firm that's verified its own sending domain (Settings > Integrations)
  // gets its outbound mail branded with that domain instead of
  // verexahq.com -- e.g. a client sees mail from "notifications@theirfirm.com"
  // rather than "noreply@verexahq.com". Falls back silently to the system
  // default if nothing's configured or verification hasn't completed yet.
  //
  // A workspace can have more than one verified domain (ERO Office /
  // Service Bureau multi-domain support). A caller can pass domainId to
  // pick a specific one (e.g. a per-organizer-template sending_domain_id,
  // for a service bureau routing different brands through different
  // domains) -- it must still be verified and belong to this workspace, or
  // this falls through to the usual "primary verified domain" pick.
  let usedCustomDomain = false;
  if (workspaceId) {
    let customDomain: { domain: string; from_local_part: string } | null = null;
    if (domainId) {
      const { data } = await supabase
        .from("workspace_email_domains")
        .select("domain, from_local_part")
        .eq("id", domainId)
        .eq("workspace_id", workspaceId)
        .eq("status", "verified")
        .maybeSingle();
      customDomain = data;
    }
    if (!customDomain) {
      const { data } = await supabase
        .from("workspace_email_domains")
        .select("domain, from_local_part")
        .eq("workspace_id", workspaceId)
        .eq("status", "verified")
        .order("is_primary", { ascending: false })
        .limit(1)
        .maybeSingle();
      customDomain = data;
    }
    if (customDomain) {
      fromAddress = `${customDomain.from_local_part}@${customDomain.domain}`;
      usedCustomDomain = true;
    }
  }

  // branding.email_from_name/reply_to_email exist for firms to override the
  // display name/reply-to on outgoing mail, but were never read anywhere --
  // only applied here (when sending from the firm's own domain) so a
  // workspace still on verexahq.com keeps the platform's own identity
  // unless it explicitly asks otherwise via an explicit fromName/replyTo.
  let resolvedFromName = fromName;
  let resolvedReplyTo = replyTo;
  if (usedCustomDomain && workspaceId && (!fromName || !replyTo)) {
    const { data: brandingRow } = await supabase
      .from("branding")
      .select("email_from_name, display_name, reply_to_email")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!resolvedFromName) resolvedFromName = brandingRow?.email_from_name || brandingRow?.display_name || undefined;
    if (!resolvedReplyTo) resolvedReplyTo = brandingRow?.reply_to_email || undefined;
  }

  const displayName = resolvedFromName || process.env.EMAIL_FROM_NAME || "Verexa HQ CRM";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${displayName} <${fromAddress}>`,
      to: [to],
      subject,
      html,
      ...(resolvedReplyTo ? { reply_to: resolvedReplyTo } : {}),
    }),
  });

  if (!res.ok) {
    if (workspaceId && reservedSource) {
      await supabase.rpc("refund_usage_unit", { p_workspace_id: workspaceId, p_resource_type: "email", p_source: reservedSource });
    }
    const text = await res.text().catch(() => "");
    return { sent: false, error: `Resend responded with ${res.status}: ${text}` };
  }

  const data = (await res.json()) as { id?: string };
  return { sent: true, id: data.id };
}

/**
 * Verifies a Resend webhook signature per the documented svix scheme
 * (svix-id/svix-timestamp/svix-signature headers, HMAC-SHA256 over
 * `${id}.${timestamp}.${payload}`, base64) without needing the svix SDK --
 * same hand-rolled approach as verifyStripeSignature.
 */
export async function verifyResendSignature(
  payload: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  secret: string
): Promise<boolean> {
  const crypto = await import("crypto");
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${svixId}.${svixTimestamp}.${payload}`;
  const expected = crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");

  const candidates = svixSignature.split(" ").map((part) => part.split(",")[1]).filter(Boolean);
  const expectedBuf = Buffer.from(expected, "base64");
  return candidates.some((candidate) => {
    const candidateBuf = Buffer.from(candidate, "base64");
    return candidateBuf.length === expectedBuf.length && crypto.timingSafeEqual(candidateBuf, expectedBuf);
  });
}
