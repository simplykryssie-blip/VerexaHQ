import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type WebhookStatus = {
  configured: boolean;
  endpoint_token: string | null;
  has_secret: boolean;
  rotated_at: string | null;
};

async function getAdminWorkspace() {
  const supabase = createClient();
  const { data: workspace } = await supabase.rpc("get_current_workspace");
  if (!workspace?.id) return { supabase, workspace: null };
  const { data: canManage } = await supabase.rpc("is_workspace_admin", { p_workspace_id: workspace.id });
  if (!canManage) return { supabase, workspace: null };
  return { supabase, workspace };
}

export async function GET() {
  const { supabase, workspace } = await getAdminWorkspace();
  if (!workspace) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { data, error } = await supabase.rpc("get_partner_purchase_webhook_status", {
    p_workspace_id: workspace.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const status = (data ?? {}) as WebhookStatus;
  const endpointToken = status.endpoint_token;
  return NextResponse.json({
    configured: Boolean(status.configured),
    hasSecret: Boolean(status.has_secret),
    rotatedAt: status.rotated_at ?? null,
    endpointToken,
    endpointUrl: endpointToken
      ? `${new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://verexahq.com").origin}/api/partner-purchase-webhook/${endpointToken}`
      : null,
  });
}

export async function POST(request: Request) {
  const { supabase, workspace } = await getAdminWorkspace();
  if (!workspace) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = (await request.json().catch(() => null)) as { signingSecret?: unknown } | null;
  const signingSecret = typeof body?.signingSecret === "string" ? body.signingSecret.trim() : "";
  if (!/^whsec_[A-Za-z0-9]+$/.test(signingSecret)) {
    return NextResponse.json({ error: "Enter a valid Stripe webhook signing secret." }, { status: 400 });
  }

  const { error } = await supabase.rpc("set_partner_purchase_webhook_secret", {
    p_workspace_id: workspace.id,
    p_signing_secret: signingSecret,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
