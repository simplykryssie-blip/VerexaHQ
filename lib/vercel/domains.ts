import { isVercelDomainAutomationConfigured } from "@/lib/providerStatus";

const VERCEL_API = "https://api.vercel.com";

// Identify this specific deployment (team + project). Not secrets -- these
// are stable ids for the Vercel project this app is deployed to, safe to
// hardcode; only the bearer token below is sensitive. A fork redeployed to
// a different Vercel team/project would need to update these too, same as
// it would need its own Supabase project, Resend key, etc.
const VERCEL_TEAM_ID = "team_GYAqHxxDoKh3pOd0pK3X1wgL";
const VERCEL_PROJECT_ID = "prj_ce8ecRjdkPTPONnQiZ5Ur859BdAu";

export type VercelResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export type VercelVerificationChallenge = { type: string; domain: string; value: string; reason: string };

export type VercelProjectDomain = {
  name: string;
  apexName: string;
  verified: boolean;
  verification: VercelVerificationChallenge[];
};

export type VercelDomainConfig = {
  configuredBy: "CNAME" | "A" | "http" | null;
  misconfigured: boolean;
};

function headers() {
  return {
    Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}`,
    "Content-Type": "application/json",
  };
}

function notConfigured<T>(): VercelResult<T> {
  return { ok: false, reason: "Domain automation is not configured for this environment." };
}

async function errorReason(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  return body?.error?.message ?? `Vercel responded with ${res.status}`;
}

/**
 * Attaches a domain to the project. Idempotent: checks whether the domain
 * is already attached to this same project first and, if so, returns its
 * current state directly rather than attempting to re-add it -- a prior
 * version instead tried to add it and recover by matching Vercel's error
 * code on failure, but the code it checked for (domain_taken /
 * domain_already_exists) didn't match what Vercel actually returns for
 * this case ("Cannot add X since it's already in use by one of your
 * projects" even when X is already attached -- and verified -- on this
 * exact same project), so the raw error reached the user instead of being
 * absorbed. Checking first sidesteps relying on Vercel's exact error
 * taxonomy for the common case; the same error-code recovery is kept
 * below as a fallback for the narrow race where the domain gets attached
 * between the check and the POST.
 */
export async function addProjectDomain(domain: string): Promise<VercelResult<VercelProjectDomain>> {
  if (!isVercelDomainAutomationConfigured()) return notConfigured();

  const existing = await getProjectDomain(domain);
  if (existing.ok && existing.data) {
    return { ok: true, data: existing.data };
  }

  const res = await fetch(`${VERCEL_API}/v10/projects/${VERCEL_PROJECT_ID}/domains?teamId=${VERCEL_TEAM_ID}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ name: domain }),
  });
  if (res.ok) {
    const data = (await res.json()) as VercelProjectDomain;
    return { ok: true, data };
  }

  const body = await res.json().catch(() => null);
  if (body?.error?.code === "domain_taken" || body?.error?.code === "domain_already_exists") {
    return getProjectDomain(domain).then((result) =>
      result.ok && result.data ? { ok: true, data: result.data } : { ok: false, reason: body.error.message ?? "Domain already exists." }
    );
  }
  return { ok: false, reason: body?.error?.message ?? `Vercel responded with ${res.status}` };
}

/** Returns null (not an error) when the domain isn't attached to this project at all. */
export async function getProjectDomain(domain: string): Promise<VercelResult<VercelProjectDomain | null>> {
  if (!isVercelDomainAutomationConfigured()) return notConfigured();

  const res = await fetch(`${VERCEL_API}/v9/projects/${VERCEL_PROJECT_ID}/domains/${domain}?teamId=${VERCEL_TEAM_ID}`, {
    headers: headers(),
  });
  if (res.status === 404) return { ok: true, data: null };
  if (!res.ok) return { ok: false, reason: await errorReason(res) };
  const data = (await res.json()) as VercelProjectDomain;
  return { ok: true, data };
}

/** DNS-pointing status, separate from project-ownership verification above. */
export async function getDomainConfig(domain: string): Promise<VercelResult<VercelDomainConfig>> {
  if (!isVercelDomainAutomationConfigured()) return notConfigured();

  const res = await fetch(`${VERCEL_API}/v6/domains/${domain}/config?teamId=${VERCEL_TEAM_ID}`, { headers: headers() });
  if (!res.ok) return { ok: false, reason: await errorReason(res) };
  const data = (await res.json()) as VercelDomainConfig;
  return { ok: true, data };
}

export async function removeProjectDomain(domain: string): Promise<VercelResult<{ removed: boolean }>> {
  if (!isVercelDomainAutomationConfigured()) return notConfigured();

  const res = await fetch(`${VERCEL_API}/v9/projects/${VERCEL_PROJECT_ID}/domains/${domain}?teamId=${VERCEL_TEAM_ID}`, {
    method: "DELETE",
    headers: headers(),
  });
  // A domain that's already gone (404) is still a successful end state.
  if (!res.ok && res.status !== 404) return { ok: false, reason: await errorReason(res) };
  return { ok: true, data: { removed: true } };
}
