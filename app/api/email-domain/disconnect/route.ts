import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { deleteResendDomain } from "@/lib/email/domains";
import { hasAal2, AAL2_REQUIRED_RESPONSE_BODY, AAL2_REQUIRED_STATUS } from "@/lib/auth/requireAal2";

export async function POST(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  // Deliberately NOT gated on isWorkspaceStatusOperational -- releasing a
  // domain a customer owns must stay reachable for a suspended/archived
  // workspace too, or leaving Verexa requires contacting support to get it
  // released. release_workspace_email_domain (below) enforces real
  // ownership (settings.manage) independent of billing status.

  const supabase = createClient();
  const { data: canManageSettings } = await supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "settings.manage" });
  if (!canManageSettings) {
    return NextResponse.json({ error: "You don't have permission to manage this workspace's integrations." }, { status: 403 });
  }

  // VEREXA-AAL-001: removing the sending domain changes this workspace's
  // email-sending control -- a password-only session must not be
  // sufficient on its own.
  if (!(await hasAal2(supabase))) {
    return NextResponse.json(AAL2_REQUIRED_RESPONSE_BODY, { status: AAL2_REQUIRED_STATUS });
  }

  // domainId disambiguates which of a workspace's (possibly several)
  // sending domains to remove -- falls back to the primary one so an old
  // client calling this with no body still removes the same domain it
  // always did (the only one, in the single-domain case).
  const { domainId } = (await request.json().catch(() => ({}))) as { domainId?: string };
  // Scoped to released_at is null -- unlike the old hard-delete, a released
  // row still exists afterward, so a retried/double-clicked disconnect for
  // the same domainId must find nothing here (and return the same clean
  // {ok:true} as "already gone") rather than re-running deleteResendDomain
  // against an id Resend no longer has, which would fail and surface a
  // confusing error for a domain that's actually already released.
  const query = supabase.from("workspace_email_domains").select("id, resend_domain_id").eq("workspace_id", workspace.id).is("released_at", null);
  const { data: existing } = await (domainId ? query.eq("id", domainId) : query.eq("is_primary", true)).maybeSingle();
  if (!existing) {
    return NextResponse.json({ ok: true });
  }

  const result = await deleteResendDomain(existing.resend_domain_id);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 502 });
  }

  // Soft-release, not a hard delete -- preserves history (support, abuse
  // investigation, reclaim conflicts) and is what frees this domain string
  // for another workspace (or this same one) to reclaim. SECURITY DEFINER,
  // so it still persists even if this workspace is suspended/archived; it
  // also handles promoting the next-oldest remaining domain to primary.
  const { error } = await supabase.rpc("release_workspace_email_domain", { p_domain_id: existing.id });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
