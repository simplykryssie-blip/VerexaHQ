import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { syncResendDomainStatus } from "@/lib/email/domains";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

// Recurring counterpart to the "Check verification" button on the Sending
// domain card in Settings > Integrations -- so a workspace doesn't have to
// keep coming back to click it while DNS propagates. Sweeps every domain
// not yet verified, re-checks against Resend, and self-heals the stored
// domain name to whatever Resend actually has on file if it ever drifts
// (the root cause of an earlier stuck-pending case).
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data: pending, error } = await supabase
    .from("workspace_email_domains")
    .select("id, resend_domain_id")
    .neq("status", "verified")
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let checked = 0;
  let verified = 0;
  for (const row of pending ?? []) {
    checked += 1;
    const sync = await syncResendDomainStatus(row.resend_domain_id);
    if (!sync.ok) continue;
    if (sync.data.status === "verified") verified += 1;

    await supabase
      .from("workspace_email_domains")
      .update({
        domain: sync.data.domain,
        status: sync.data.status,
        dns_records: sync.data.dns_records,
        verified_at: sync.data.status === "verified" ? new Date().toISOString() : null,
      })
      .eq("id", row.id);
  }

  return NextResponse.json({ checked, verified });
}
