import { NextResponse } from "next/server";
import dns from "node:dns/promises";
import { createClient } from "@/lib/supabase/server";
import { authorizedWebsite } from "@/lib/websites/auth";
import { getDomainConfig } from "@/lib/vercel/domains";
import { isVercelDomainAutomationConfigured } from "@/lib/providerStatus";

// Vercel's documented apex-domain A record and CNAME target for pointing
// an external domain at a project. These are stable, publicly-documented
// values (not project-specific), so they're usable for the instructional
// copy regardless of which verification path below actually runs.
const VERCEL_APEX_IP = "76.76.21.21";
const VERCEL_CNAME_TARGET = "cname.vercel-dns.com";

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

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const result = await authorizedWebsite(params.id);
  if ("error" in result) return result.error;
  if (!result.website.custom_domain) {
    return NextResponse.json({ error: "No custom domain set on this website." }, { status: 400 });
  }

  const domain = result.website.custom_domain;
  const apex = isApexDomain(domain);

  // Once the domain automation is on, Vercel's own config check is the
  // authoritative answer (it reflects what's actually live, not just what
  // this server's resolver happens to see) -- fall back to a plain DNS
  // lookup when that automation isn't configured.
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

  const supabase = createClient();
  await supabase
    .from("site_websites")
    .update({ domain_verified: verified, domain_verified_at: verified ? new Date().toISOString() : null })
    .eq("id", result.website.id);

  return NextResponse.json({
    verified,
    isApex: apex,
    recordType: apex ? "A" : "CNAME",
    expected: apex ? VERCEL_APEX_IP : VERCEL_CNAME_TARGET,
    found,
  });
}
