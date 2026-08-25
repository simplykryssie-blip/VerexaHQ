import { isEmailConfigured } from "@/lib/providerStatus";

const RESEND_API = "https://api.resend.com";

export type ResendResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export type ResendDnsRecord = {
  record: string;
  name: string;
  type: string;
  ttl: string;
  status: string;
  value: string;
  priority?: number;
};

type ResendDomain = {
  id: string;
  name: string;
  status: string;
  records: ResendDnsRecord[];
};

function headers() {
  return {
    Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    "Content-Type": "application/json",
  };
}

export async function createResendDomain(domain: string): Promise<ResendResult<ResendDomain>> {
  if (!isEmailConfigured()) return { ok: false, reason: "Email provider is not configured for this environment." };

  const res = await fetch(`${RESEND_API}/domains`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ name: domain }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Resend responded with ${res.status}: ${text}` };
  }
  const data = (await res.json()) as ResendDomain;
  return { ok: true, data };
}

export async function getResendDomain(id: string): Promise<ResendResult<ResendDomain>> {
  if (!isEmailConfigured()) return { ok: false, reason: "Email provider is not configured for this environment." };

  const res = await fetch(`${RESEND_API}/domains/${id}`, { headers: headers() });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Resend responded with ${res.status}: ${text}` };
  }
  const data = (await res.json()) as ResendDomain;
  return { ok: true, data };
}

export async function verifyResendDomain(id: string): Promise<ResendResult<{ id: string; status: string }>> {
  if (!isEmailConfigured()) return { ok: false, reason: "Email provider is not configured for this environment." };

  const res = await fetch(`${RESEND_API}/domains/${id}/verify`, { method: "POST", headers: headers() });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Resend responded with ${res.status}: ${text}` };
  }
  const data = (await res.json()) as { id: string; status?: string };
  return { ok: true, data: { id: data.id, status: data.status ?? "pending" } };
}

export type ResendDomainSync = { domain: string; status: "pending" | "verified" | "failed"; dns_records: ResendDnsRecord[] };

/**
 * Shared by the interactive "Check verification" endpoint and the recurring
 * cron sweep: triggers Resend's own re-check, then reads back the current
 * state. Returns the domain name Resend actually has on file (not just
 * status) so a caller can correct a workspace's stored domain string if it
 * ever drifts from what's really registered with Resend.
 */
export async function syncResendDomainStatus(resendDomainId: string): Promise<ResendResult<ResendDomainSync>> {
  await verifyResendDomain(resendDomainId);
  const result = await getResendDomain(resendDomainId);
  if (!result.ok) return result;

  const status = result.data.status === "verified" ? "verified" : result.data.status === "failed" ? "failed" : "pending";
  return { ok: true, data: { domain: result.data.name, status, dns_records: result.data.records } };
}

export async function deleteResendDomain(id: string): Promise<ResendResult<{ deleted: boolean }>> {
  if (!isEmailConfigured()) return { ok: false, reason: "Email provider is not configured for this environment." };

  const res = await fetch(`${RESEND_API}/domains/${id}`, { method: "DELETE", headers: headers() });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Resend responded with ${res.status}: ${text}` };
  }
  return { ok: true, data: { deleted: true } };
}
