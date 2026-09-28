import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace, workspaceOperationalError, isWorkspaceStatusOperational } from "@/lib/workspace";

// Only meaningful for a workspace with more than one sending domain
// (canUseMultipleSendingDomains) -- switches which verified domain
// sendEmailViaResend uses. The RPC itself re-checks permission and that
// the target domain is verified, so this route is a thin pass-through.
export async function POST(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isWorkspaceStatusOperational(workspace.status)) {
    return NextResponse.json({ error: workspaceOperationalError(workspace) }, { status: 403 });
  }

  const { domainId } = (await request.json().catch(() => ({}))) as { domainId?: string };
  if (!domainId) {
    return NextResponse.json({ error: "domainId is required." }, { status: 400 });
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("set_workspace_email_domain_primary", { p_domain_id: domainId });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
