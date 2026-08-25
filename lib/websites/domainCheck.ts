import dns from "node:dns/promises";
import { getDomainConfig } from "@/lib/vercel/domains";
import { isVercelDomainAutomationConfigured } from "@/lib/providerStatus";

// Vercel's documented apex-domain A record and CNAME target for pointing
// an external domain at a project. These are stable, publicly-documented
// values (not project-specific), so they're usable for the instructional
// copy regardless of which verification path below actually runs.
const VERCEL_APEX_IP = "76.76.21.21";
const VERCEL_CNAME_TARGET = "cname.vercel-dns.com";

export type DomainCheckResult = {
  verified: boolean;
  isApex: boolean;
  recordType: "A" | "CNAME";
  expected: string;
  found: string[];
};

function isApexDomain(domain: string): boolean {
  // Conservative heuristic: exactly two labels (example.com) is an apex
  // domain needing an A record; anything with a subdomain label
  // (www.example.com) gets a CNAME. A multi-part TLD (co.uk) mis-detects
  // as having a subdomain, which just means a CNAME is recommended instead
  // -- still a valid Vercel setup, so this errs safe either way.
  return domain.split(".").length === 2;
}

async function checkViaDns(domain: string, apex: boolean): Promise<{ verified: boolean; found: string[] }> {
  try {
    if (apex) {
      const found = await dns.resolve4(domain);
      return { verified: found.includes(VERCEL_APEX_IP), found };
    }
    const records = await dns.resolveCname(domain);
    const found = records.map((record) => record.replace(/\.$/, "").toLowerCase());
    return { verified: found.includes(VERCEL_CNAME_TARGET), found };
  } catch {
    // NXDOMAIN / ENODATA / timeout -- no record published yet. This is the
    // normal state while DNS is propagating, not an error to surface.
    return { verified: false, found: [] };
  }
}

/**
 * Shared by the interactive "Verify DNS" endpoint and the recurring cron
 * sweep. Once domain automation is configured, Vercel's own config check is
 * the authoritative answer (it reflects what's actually live, not just what
 * this server's resolver happens to see) -- falls back to a plain DNS
 * lookup otherwise.
 */
export async function checkWebsiteDomain(domain: string): Promise<DomainCheckResult> {
  const apex = isApexDomain(domain);
  let verified: boolean;
  let found: string[];

  if (isVercelDomainAutomationConfigured()) {
    const config = await getDomainConfig(domain);
    if (config.ok) {
      verified = !config.data.misconfigured;
      found = config.data.configuredBy ? [config.data.configuredBy] : [];
    } else {
      ({ verified, found } = await checkViaDns(domain, apex));
    }
  } else {
    ({ verified, found } = await checkViaDns(domain, apex));
  }

  return {
    verified,
    isApex: apex,
    recordType: apex ? "A" : "CNAME",
    expected: apex ? VERCEL_APEX_IP : VERCEL_CNAME_TARGET,
    found,
  };
}
