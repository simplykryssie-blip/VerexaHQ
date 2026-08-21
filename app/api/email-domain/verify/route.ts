import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { getResendDomain, verifyResendDomain } from "@/lib/email/domains";

export async function POST() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createClient();
  const { data: canManageSettings } = await supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "settings.manage" });
  if (!canManageSettings) {
    return NextResponse.json({ error: "You don't have permission to manage this workspace's integrations." }, { status: 403 });
  }

  const { data: existing } = await supabase
    .from("workspace_email_domains")
    .select("id, resend_domain_id")
    .eq("workspace_id", workspace.id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "No sending domain configured for this workspace." }, { status: 404 });
  }

  await verifyResendDomain(existing.resend_domain_id);
  const result = await getResendDomain(existing.resend_domain_id);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 502 });
  }

  const status = result.data.status === "verified" ? "verified" : result.data.status === "failed" ? "failed" : "pending";
  const { data: row, error } = await supabase
    .from("workspace_email_domains")
    .update({
      status,
      dns_records: result.data.records,
      verified_at: status === "verified" ? new Date().toISOString() : null,
    })
    .eq("id", existing.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, domain: row });
}
