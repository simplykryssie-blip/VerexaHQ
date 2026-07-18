import { authenticatedFetch } from "@/lib/authenticatedFetch";

export async function sendEmail(to: string, subject: string, html: string) {
  const res = await authenticatedFetch("/api/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, subject, html }),
  });
  return res.json() as Promise<{ ok: boolean; sent: boolean; reason?: string; error?: string }>;
}

export async function sendSms(to: string, body: string) {
  const res = await authenticatedFetch("/api/sms/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, body }),
  });
  return res.json() as Promise<{ ok: boolean; sent: boolean; reason?: string; error?: string }>;
}

export async function getProviderStatus() {
  const res = await authenticatedFetch("/api/provider-status");
  return res.json() as Promise<{ email: boolean; sms: boolean; stripe: boolean }>;
}
