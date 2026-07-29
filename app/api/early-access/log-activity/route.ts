import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, createServiceClient } from "@/lib/serverAuth";

// early_access_activity_logs has no INSERT policy for `authenticated` (by
// design -- an admin shouldn't be able to write their own audit trail
// directly), so every admin action logs through this route with the
// service-role client after independently re-verifying platform-admin
// status server-side.
export async function POST(req: NextRequest) {
  let user, supabase;
  try {
    ({ user, supabase } = await authenticateRequest(req));
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (isAdmin !== true) {
    return NextResponse.json({ ok: false, error: "Platform admin access required." }, { status: 403 });
  }

  const payload = (await req.json().catch(() => null)) as {
    campaignId?: string | null;
    workspaceId?: string | null;
    action?: string;
    entityType?: string;
    entityId?: string | null;
    details?: Record<string, unknown>;
  } | null;

  const action = payload?.action?.trim();
  const entityType = payload?.entityType?.trim();
  if (!action || !entityType) {
    return NextResponse.json({ ok: false, error: "Missing action or entityType." }, { status: 400 });
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ ok: false, error: "Server logging credential not configured." }, { status: 503 });
  }

  const { error } = await service.from("early_access_activity_logs").insert({
    campaign_id: payload?.campaignId ?? null,
    workspace_id: payload?.workspaceId ?? null,
    actor_user_id: user.id,
    action,
    entity_type: entityType,
    entity_id: payload?.entityId ?? null,
    details: payload?.details ?? {},
  });

  if (error) {
    return NextResponse.json({ ok: false, error: "Unable to record activity log." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
