import { isSmsConfigured } from "@/lib/providerStatus";
import { createServiceClient } from "@/lib/supabase/service";

export type SendSmsResult = { sent: boolean; reason?: string; error?: string; id?: string };

// Resolves which number a workspace sends from: the client's assigned
// number if one is set, else the workspace's own free number, else the
// platform's shared default (TWILIO_FROM_NUMBER) for workspaces that
// haven't provisioned a number of their own yet. Never returns a paused
// number -- callers get a clear reason instead so they know to top up.
export type ResolvedSmsFrom = { ok: true; from: string } | { ok: false; reason: string };

export async function resolveSmsFromNumber(workspaceId: string, clientId?: string | null): Promise<ResolvedSmsFrom> {
  const supabase = createServiceClient();

  if (clientId) {
    const { data: assigned } = await supabase
      .from("workspace_phone_numbers")
      .select("phone_number, status")
      .eq("workspace_id", workspaceId)
      .eq("assigned_client_id", clientId)
      .maybeSingle();
    if (assigned) {
      return assigned.status === "active"
        ? { ok: true, from: assigned.phone_number }
        : { ok: false, reason: "This client's assigned phone number is paused -- top up the SMS balance to reactivate it." };
    }
  }

  const { data: freeNumber } = await supabase
    .from("workspace_phone_numbers")
    .select("phone_number, status")
    .eq("workspace_id", workspaceId)
    .eq("is_free", true)
    .maybeSingle();
  if (freeNumber) {
    return { ok: true, from: freeNumber.phone_number };
  }

  return { ok: true, from: process.env.TWILIO_FROM_NUMBER! };
}

export async function sendSmsViaTwilio({
  to,
  body,
  workspaceId,
  clientId,
}: {
  to: string;
  body: string;
  workspaceId?: string;
  clientId?: string;
}): Promise<SendSmsResult> {
  if (!isSmsConfigured()) {
    return { sent: false, reason: "SMS provider is not configured for this environment." };
  }

  // A paused number (balance couldn't cover its monthly fee) blocks the
  // send outright -- it never silently falls back to a different number.
  let from = process.env.TWILIO_FROM_NUMBER!;
  if (workspaceId) {
    const resolved = await resolveSmsFromNumber(workspaceId, clientId);
    if (!resolved.ok) {
      return { sent: false, reason: resolved.reason };
    }
    from = resolved.from;
  }

  // Same free-bucket-then-prepaid-balance draw as sendEmailViaResend --
  // see that function for the full rationale. A workspace never granted
  // either (not on a paid plan) passes through unmetered.
  let reservedSource: string | null = null;
  if (workspaceId) {
    const supabase = createServiceClient();
    const { data: reservation } = await supabase.rpc("reserve_usage_unit", { p_workspace_id: workspaceId, p_resource_type: "sms" }).single();
    if (!reservation?.allowed) {
      return { sent: false, reason: "This workspace's SMS balance is used up. Purchase a top-up to keep sending." };
    }
    reservedSource = reservation.source;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const authToken = process.env.TWILIO_AUTH_TOKEN!;

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });

  if (!res.ok) {
    if (workspaceId && reservedSource) {
      const supabase = createServiceClient();
      await supabase.rpc("refund_usage_unit", { p_workspace_id: workspaceId, p_resource_type: "sms", p_source: reservedSource });
    }
    const text = await res.text().catch(() => "");
    return { sent: false, error: `Twilio responded with ${res.status}: ${text}` };
  }

  const data = (await res.json()) as { sid?: string };
  return { sent: true, id: data.sid };
}

/**
 * Verifies a Twilio webhook signature per Twilio's documented scheme:
 * HMAC-SHA1 over the full request URL + sorted POST param key/value pairs
 * concatenated, base64-encoded, using the auth token as the key -- no
 * Twilio SDK needed, same hand-rolled approach as verifyStripeSignature.
 */
export async function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signatureHeader: string,
  authToken: string
): Promise<boolean> {
  const crypto = await import("crypto");
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((key) => key + params[key])
      .join("");

  const expected = crypto.createHmac("sha1", authToken).update(data).digest("base64");
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signatureHeader);
  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}
