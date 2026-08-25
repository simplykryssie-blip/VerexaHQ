import { NextResponse } from "next/server";
import dns from "node:dns/promises";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";

// Vercel's documented apex-domain A record and CNAME target for pointing
// an external domain at a project. These are stable, publicly-documented
// values (not project-specific), so no Vercel API access is needed to
// tell a workspace what to put in their DNS.
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

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createClient();
  const { data: canManage } = await supabase.rpc("has_permission", {
    p_workspace_id: workspace.id,
    p_permission_key: "site_pages.manage",
  });
  if (!canManage) {
    return NextResponse.json({ error: "You don't have permission to manage this website." }, { status: 403 });
  }

  const { data: website } = await supabase
    .from("site_websites")
    .select("id, workspace_id, custom_domain")
    .eq("id", params.id)
    .maybeSingle();

  if (!website || website.workspace_id !== workspace.id) {
    return NextResponse.json({ error: "Website not found." }, { status: 404 });
  }
  if (!website.custom_domain) {
    return NextResponse.json({ error: "No custom domain set on this website." }, { status: 400 });
  }

  const domain = website.custom_domain;
  const apex = isApexDomain(domain);
  let found: string[] = [];
  let verified = false;

  try {
    if (apex) {
      found = await dns.resolve4(domain);
      verified = found.includes(VERCEL_APEX_IP);
    } else {
      const records = await dns.resolveCname(domain);
      found = records.map((record) => record.replace(/\.$/, "").toLowerCase());
      verified = found.includes(VERCEL_CNAME_TARGET);
    }
  } catch {
    // NXDOMAIN / ENODATA / timeout -- no record published yet. This is the
    // normal state while DNS is propagating, not an error to surface.
    found = [];
    verified = false;
  }

  await supabase
    .from("site_websites")
    .update({ domain_verified: verified, domain_verified_at: verified ? new Date().toISOString() : null })
    .eq("id", website.id);

  return NextResponse.json({
    verified,
    isApex: apex,
    recordType: apex ? "A" : "CNAME",
    expected: apex ? VERCEL_APEX_IP : VERCEL_CNAME_TARGET,
    found,
  });
}
