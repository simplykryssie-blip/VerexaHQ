import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkWebsiteDomain } from "@/lib/websites/domainCheck";
import { addProjectDomain } from "@/lib/vercel/domains";
import { isVercelDomainAutomationConfigured } from "@/lib/providerStatus";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

// Recurring counterpart to the "Verify DNS" button in Website Settings --
// so a workspace doesn't have to keep coming back to click it while DNS
// propagates. Sweeps every website with a custom domain still unverified,
// re-attaches to Vercel (idempotent, self-heals a transient attach failure
// from when the domain was first connected), and re-checks. Only ever
// touches rows still domain_verified = false, so a verified domain is left
// alone -- if a workspace's DNS later breaks, that's surfaced by them
// re-checking manually, not silently flipped back by this sweep.
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: pending, error } = await supabase
    .from("site_websites")
    .select("id, custom_domain")
    .not("custom_domain", "is", null)
    .eq("domain_verified", false)
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let checked = 0;
  let verified = 0;
  for (const website of pending ?? []) {
    if (!website.custom_domain) continue;
    checked += 1;

    if (isVercelDomainAutomationConfigured()) {
      await addProjectDomain(website.custom_domain);
    }

    const check = await checkWebsiteDomain(website.custom_domain);
    if (check.verified) verified += 1;

    await supabase
      .from("site_websites")
      .update({ domain_verified: check.verified, domain_verified_at: check.verified ? new Date().toISOString() : null })
      .eq("id", website.id);
  }

  return NextResponse.json({ checked, verified });
}
