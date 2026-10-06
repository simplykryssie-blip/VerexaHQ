import { NextResponse } from "next/server";
import { addProjectDomain, removeProjectDomain } from "@/lib/vercel/domains";
import { isVercelDomainAutomationConfigured } from "@/lib/providerStatus";
import { authorizedWebsite } from "@/lib/websites/auth";
import { createClient } from "@/lib/supabase/server";
import { hasAal2 } from "@/lib/auth/requireAal2";

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
    return NextResponse.json(
      { error: "This action requires two-factor verification. Complete your authenticator challenge and try again." },
      { status: 403 }
    );
  }

  const remove = await removeProjectDomain(result.website.custom_domain);
  if (!remove.ok) {
    return NextResponse.json({ error: remove.reason }, { status: 502 });
  }

  return NextResponse.json({ automated: true, removed: true });
}
