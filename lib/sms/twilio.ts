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
