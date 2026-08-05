import { isEmailConfigured } from "@/lib/providerStatus";

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
}: {
  to: string;
  subject: string;
  html: string;
  sender?: SystemSenderKey;
  fromName?: string;
  replyTo?: string;
}): Promise<SendEmailResult> {
  if (!isEmailConfigured()) {
    return { sent: false, reason: "Email provider is not configured for this environment." };
  }

  const fromAddress = process.env.EMAIL_FROM_ADDRESS || SYSTEM_SENDERS[sender];
  const displayName = fromName || process.env.EMAIL_FROM_NAME || "VerexaHQ";

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
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  if (!res.ok) {
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
