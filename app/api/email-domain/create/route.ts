import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { createResendDomain } from "@/lib/email/domains";

export async function POST(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createClient();
  const { data: canManageSettings } = await supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "settings.manage" });
  if (!canManageSettings) {
    return NextResponse.json({ error: "You don't have permission to manage this workspace's integrations." }, { status: 403 });
  }

  const { domain } = (await request.json()) as { domain?: string };
  const rawDomain = domain?.trim().toLowerCase() ?? "";
  const cleanDomain = rawDomain.replace(/^https?:\/\//, "").split("/")[0];

  if (!cleanDomain) {
    return NextResponse.json({ error: "Enter a domain, e.g. yourfirm.com" }, { status: 400 });
  }
  if (cleanDomain.includes("@")) {
    return NextResponse.json({ error: "That looks like an email address. Enter just the domain, e.g. yourfirm.com, not an email address." }, { status: 400 });
  }
  if (/\s/.test(rawDomain)) {
    return NextResponse.json({ error: "A domain can't contain spaces, e.g. yourfirm.com." }, { status: 400 });
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(cleanDomain)) {
    return NextResponse.json({ error: "Enter a valid domain, e.g. yourfirm.com -- no spaces, @ symbols, or extra text." }, { status: 400 });
  }

  const { data: existing } = await supabase.from("workspace_email_domains").select("id").eq("workspace_id", workspace.id).maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "This workspace already has a sending domain. Remove it before adding a new one." }, { status: 409 });
  }

  const result = await createResendDomain(cleanDomain);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 502 });
  }

  const { data: row, error } = await supabase
    .from("workspace_email_domains")
    .insert({
      workspace_id: workspace.id,
      domain: cleanDomain,
      resend_domain_id: result.data.id,
      status: result.data.status === "verified" ? "verified" : "pending",
      dns_records: result.data.records,
      verified_at: result.data.status === "verified" ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, domain: row });
}
