import { NextResponse } from "next/server";
import { addProjectDomain, removeProjectDomain } from "@/lib/vercel/domains";
import { isVercelDomainAutomationConfigured } from "@/lib/providerStatus";
import { authorizedWebsite } from "@/lib/websites/auth";
import { createClient } from "@/lib/supabase/server";
import { hasAal2, AAL2_REQUIRED_RESPONSE_BODY, AAL2_REQUIRED_STATUS } from "@/lib/auth/requireAal2";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  if (!isVercelDomainAutomationConfigured()) {
    return NextResponse.json({ automated: false });
  }

  const result = await authorizedWebsite(params.id);
  if ("error" in result) return result.error;
  if (!result.website.custom_domain) {
    return NextResponse.json({ error: "No custom domain set on this website." }, { status: 400 });
  }

  const attach = await addProjectDomain(result.website.custom_domain);
  if (!attach.ok) {
    return NextResponse.json({ error: attach.reason }, { status: 502 });
  }

  return NextResponse.json({
    automated: true,
    verified: attach.data.verified,
    verification: attach.data.verification,
  });
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  if (!isVercelDomainAutomationConfigured()) {
    return NextResponse.json({ automated: false });
  }

  const result = await authorizedWebsite(params.id);
  if ("error" in result) return result.error;
  if (!result.website.custom_domain) {
    return NextResponse.json({ automated: true, removed: true });
  }

  // VEREXA-AAL-001: disconnecting a custom domain remains a protected domain-control action.
  if (!(await hasAal2(createClient()))) {
    return NextResponse.json(AAL2_REQUIRED_RESPONSE_BODY, { status: AAL2_REQUIRED_STATUS });
  }

  const remove = await removeProjectDomain(result.website.custom_domain);
  if (!remove.ok) {
    return NextResponse.json({ error: remove.reason }, { status: 502 });
  }

  // Persists the release server-side (nulls custom_domain/domain_verified*,
  // which is also what frees the domain for reclaim) through a SECURITY
  // DEFINER RPC rather than a plain table update, so this still works for a
  // suspended/archived workspace -- site_websites' own RLS write policies
  // require is_workspace_operational, which a departing customer's
  // workspace is, by definition, often not. This makes the route fully
  // self-contained: the caller no longer has to do its own DB write after
  // this succeeds.
  const { error: releaseError } = await createClient().rpc("release_website_custom_domain", { p_website_id: params.id });
  if (releaseError) {
    return NextResponse.json({ error: releaseError.message }, { status: 500 });
  }

  return NextResponse.json({ automated: true, removed: true });
}
