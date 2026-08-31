import { isSmsConfigured } from "@/lib/providerStatus";
import { createServiceClient } from "@/lib/supabase/service";

export type SendSmsResult = { sent: boolean; reason?: string; error?: string; id?: string };

export async function sendSmsViaTwilio({ to, body, workspaceId }: { to: string; body: string; workspaceId?: string }): Promise<SendSmsResult> {
  if (!isSmsConfigured()) {
    return { sent: false, reason: "SMS provider is not configured for this environment." };
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
  const from = process.env.TWILIO_FROM_NUMBER!;

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
