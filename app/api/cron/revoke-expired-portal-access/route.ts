import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { withJobLogging } from "@/lib/cron/withJobLogging";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

// Enforces the 30-day portal invite policy: an invite that's still sitting
// unconfirmed (status = 'invited', accepted_at null) 30+ days after being
// sent gets deactivated. revoke_expired_portal_access flips it to status =
// 'revoked', the same status getPortalIdentity() already gates portal
// access on -- no separate access check needed here, just keeping that
// column current. Idempotent: only touches status = 'invited' rows, so an
// invite that was accepted (or already revoked) is never touched again.
async function handleGET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("revoke_expired_portal_access");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ revoked: data });
}

export const GET = withJobLogging("revoke-expired-portal-access", handleGET);
