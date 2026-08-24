import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

// Enforces the 30-day portal retention window for disengaged (lifecycle_status
// = 'lost') leads: once clients.lost_at is 30+ days old, revoke_expired_portal_access
// flips their client_portal_users row to status = 'revoked', which is the same
// status getPortalIdentity() already gates on -- no separate access check needed
// here, just keeping that column current. Idempotent: only touches status = 'active'
// rows, so a lead re-engaged (lifecycle_status changed back) or already revoked is
// never touched twice.
export async function GET(request: Request) {
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
