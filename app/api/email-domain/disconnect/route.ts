import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace, workspaceOperationalError, isWorkspaceStatusOperational } from "@/lib/workspace";
import { deleteResendDomain } from "@/lib/email/domains";

export async function POST(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isWorkspaceStatusOperational(workspace.status)) {
    return NextResponse.json({ error: workspaceOperationalError(workspace) }, { status: 403 });
  }

  const supabase = createClient();
  const { data: canManageSettings } = await supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "settings.manage" });
  if (!canManageSettings) {
    return NextResponse.json({ error: "You don't have permission to manage this workspace's integrations." }, { status: 403 });
  }

  // domainId disambiguates which of a workspace's (possibly several)
  // sending domains to remove -- falls back to the primary one so an old
  // client calling this with no body still removes the same domain it
  // always did (the only one, in the single-domain case).
  const { domainId } = (await request.json().catch(() => ({}))) as { domainId?: string };
  const query = supabase.from("workspace_email_domains").select("id, resend_domain_id, is_primary").eq("workspace_id", workspace.id);
  const { data: existing } = await (domainId ? query.eq("id", domainId) : query.eq("is_primary", true)).maybeSingle();
  if (!existing) {
    return NextResponse.json({ ok: true });
  }

  const result = await deleteResendDomain(existing.resend_domain_id);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 502 });
  }

  const { error } = await supabase.from("workspace_email_domains").delete().eq("id", existing.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Removing the primary of a workspace with other domains left over
  // leaves none marked primary -- promote the next-oldest one so
  // sendEmailViaResend still has an unambiguous domain to prefer.
  if (existing.is_primary) {
    const { data: nextOldest } = await supabase
      .from("workspace_email_domains")
      .select("id")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (nextOldest) {
      await supabase.from("workspace_email_domains").update({ is_primary: true }).eq("id", nextOldest.id);
    }
  }

  return NextResponse.json({ ok: true });
}
