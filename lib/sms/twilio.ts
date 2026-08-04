import { isSmsConfigured } from "@/lib/providerStatus";

export type SendSmsResult = { sent: boolean; reason?: string; error?: string; id?: string };

export async function sendSmsViaTwilio({ to, body }: { to: string; body: string }): Promise<SendSmsResult> {
  if (!isSmsConfigured()) {
    return { sent: false, reason: "SMS provider is not configured for this environment." };
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
