import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { readResendDomainStatus } from "@/lib/email/domains";
import { withJobLogging } from "@/lib/cron/withJobLogging";
import { withSupabaseRetry } from "@/lib/supabase/withRetry";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

// Recurring counterpart to the "Check verification" button on the Sending
// domain card in Settings > Integrations -- so a workspace doesn't have to
// keep coming back to click it while DNS propagates. Sweeps every domain
// not yet verified, reads its current state from Resend, and self-heals the
// stored domain name to whatever Resend actually has on file if it ever
// drifts (the root cause of an earlier stuck-pending case).
//
// Uses a plain read (readResendDomainStatus), not the verify-triggering
// syncResendDomainStatus the manual button uses: Resend already re-checks
// pending domains against DNS on its own, so this sweep has no need to force
// a fresh /verify every run. Forcing one here previously reset an already-
// verified domain's status back to "pending" on every 15-minute tick, which
// could make a genuinely verified domain (confirmed in Resend) show as
// permanently stuck "pending" in the app.
async function handleGET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  // released_at is null -- a released domain's resend_domain_id was already
  // deleted from Resend by the disconnect route, so polling it would just
  // waste calls against a record that no longer exists (and could crowd a
  // genuinely-pending domain out of this 200-row sweep).
  const { data: pending, error } = await withSupabaseRetry(() =>
    supabase.from("workspace_email_domains").select("id, resend_domain_id").neq("status", "verified").is("released_at", null).limit(200)
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let checked = 0;
  let verified = 0;
  for (const row of pending ?? []) {
    checked += 1;
    const sync = await readResendDomainStatus(row.resend_domain_id);
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

export const GET = withJobLogging("verify-pending-email-domains", handleGET);
