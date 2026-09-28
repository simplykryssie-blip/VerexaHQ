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

function toSync(domain: ResendDomain): ResendDomainSync {
  const status = domain.status === "verified" ? "verified" : domain.status === "failed" ? "failed" : "pending";
  return { domain: domain.name, status, dns_records: domain.records };
}

/**
 * Plain read of Resend's current state for a domain, no side effects.
 * This is what the recurring cron sweep should use: Resend already
 * re-checks pending domains against DNS on its own, so a periodic sweep
 * only needs to read the result, not force a fresh check every run.
 */
export async function readResendDomainStatus(resendDomainId: string): Promise<ResendResult<ResendDomainSync>> {
  const result = await getResendDomain(resendDomainId);
  if (!result.ok) return result;
  return { ok: true, data: toSync(result.data) };
}

/**
 * Used by the interactive "Check verification" button: explicitly triggers
 * Resend's re-check, then polls for the settled result instead of reading
 * back immediately.
 *
 * Resend's /verify endpoint resets the domain to "pending" while it
 * re-runs its DNS check asynchronously (confirmed live: a domain that had
 * been fully verified read back as "pending" immediately after calling
 * /verify again, with nothing about its DNS having changed). Reading the
 * status back immediately after triggering it therefore often captures
 * that momentary reset rather than the real, settled result. Polling a
 * few times with increasing delays (instead of one fixed sleep) lets the
 * check exit early once Resend settles, while still giving a slow check
 * more than a single 4-second window to finish.
 */
export async function syncResendDomainStatus(resendDomainId: string): Promise<ResendResult<ResendDomainSync>> {
  await verifyResendDomain(resendDomainId);

  const pollDelaysMs = [2000, 2000, 2000, 4000];
  let result = await getResendDomain(resendDomainId);
  for (const delay of pollDelaysMs) {
    if (result.ok && result.data.status !== "pending") break;
    await new Promise((resolve) => setTimeout(resolve, delay));
    result = await getResendDomain(resendDomainId);
  }
  if (!result.ok) return result;
  return { ok: true, data: toSync(result.data) };
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
