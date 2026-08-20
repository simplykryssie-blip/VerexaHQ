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

export async function deleteResendDomain(id: string): Promise<ResendResult<{ deleted: boolean }>> {
  if (!isEmailConfigured()) return { ok: false, reason: "Email provider is not configured for this environment." };

  const res = await fetch(`${RESEND_API}/domains/${id}`, { method: "DELETE", headers: headers() });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Resend responded with ${res.status}: ${text}` };
  }
  return { ok: true, data: { deleted: true } };
}
