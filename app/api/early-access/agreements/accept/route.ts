import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/serverAuth";

// A regular client insert would satisfy the self_insert RLS policy
// (user_id=auth.uid(), is_workspace_member(workspace_id)), but IP address
// isn't something browser JS can determine about itself -- it has to come
// from request headers on the server, so acceptance goes through this route
// instead of a direct client insert.
export async function POST(req: NextRequest) {
  let user, supabase;
  try {
    ({ user, supabase } = await authenticateRequest(req));
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const payload = (await req.json().catch(() => null)) as {
    campaignId?: string;
    workspaceId?: string;
    agreementVersion?: string;
    agreementSnapshot?: string;
    invitationId?: string | null;
  } | null;

  const campaignId = payload?.campaignId?.trim();
  const workspaceId = payload?.workspaceId?.trim();
  const agreementVersion = payload?.agreementVersion?.trim();
  const agreementSnapshot = payload?.agreementSnapshot?.trim();
  if (!campaignId || !workspaceId || !agreementVersion || !agreementSnapshot) {
    return NextResponse.json({ ok: false, error: "Missing required agreement fields." }, { status: 400 });
  }

  const forwardedFor = req.headers.get("x-forwarded-for");
  const ipAddress = forwardedFor ? forwardedFor.split(",")[0].trim() : null;
  const userAgent = req.headers.get("user-agent");

  const { error } = await supabase.from("early_access_agreements").insert({
    campaign_id: campaignId,
    workspace_id: workspaceId,
    user_id: user.id,
    invitation_id: payload?.invitationId ?? null,
    agreement_version: agreementVersion,
    agreement_snapshot: agreementSnapshot,
    ip_address: ipAddress,
    user_agent: userAgent,
    acceptance_metadata: { accepted_via: "onboarding" },
  });

  if (error) {
    return NextResponse.json(
      { ok: false, error: "Unable to record your acceptance. It may already be recorded." },
      { status: 409 },
    );
  }
  return NextResponse.json({ ok: true });
}
