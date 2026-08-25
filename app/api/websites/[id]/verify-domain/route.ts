import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authorizedWebsite } from "@/lib/websites/auth";
import { checkWebsiteDomain } from "@/lib/websites/domainCheck";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const result = await authorizedWebsite(params.id);
  if ("error" in result) return result.error;
  if (!result.website.custom_domain) {
    return NextResponse.json({ error: "No custom domain set on this website." }, { status: 400 });
  }

  const check = await checkWebsiteDomain(result.website.custom_domain);

  const supabase = createClient();
  await supabase
    .from("site_websites")
    .update({ domain_verified: check.verified, domain_verified_at: check.verified ? new Date().toISOString() : null })
    .eq("id", result.website.id);

  return NextResponse.json(check);
}
