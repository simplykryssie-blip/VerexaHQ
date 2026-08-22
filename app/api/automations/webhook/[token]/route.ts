import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

// Public, unauthenticated by design -- this is the receiving end for an
// external system (Calendly, Zapier, a marketing-site form) to start a
// workflow. The unguessable per-automation token is the only gate;
// automations only get a working one when their trigger_type is
// 'webhook.received' and they're enabled and published, so a token for any
// other kind of automation is inert rather than a way to fire it early.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createServiceClient();

  const { data: automation } = await supabase
    .from("automations")
    .select("id, workspace_id")
    .eq("webhook_token", token)
    .eq("trigger_type", "webhook.received")
    .eq("is_enabled", true)
    .eq("status", "published")
    .maybeSingle();

  if (!automation || !automation.workspace_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const workspaceId = automation.workspace_id;

  let payload: Record<string, unknown> = {};
  try {
    const text = await request.text();
    payload = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON" }, { status: 400 });
  }

  const email = typeof payload.email === "string" ? payload.email : undefined;
  const phone = typeof payload.phone === "string" ? payload.phone : undefined;
  const firstName = typeof payload.first_name === "string" ? payload.first_name : undefined;
  const lastName = typeof payload.last_name === "string" ? payload.last_name : undefined;

  let clientId: string | null = null;
  if (email || phone) {
    const { data, error } = await supabase.rpc("find_or_create_public_lead", {
      p_workspace_id: workspaceId,
      p_first_name: firstName ?? "",
      p_last_name: lastName ?? "",
      p_email: email ?? "",
      p_phone: phone ?? "",
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    clientId = data as string;
  }

  const { data: run, error: runError } = await supabase
    .from("automation_runs")
    .insert({
      workspace_id: workspaceId,
      automation_id: automation.id,
      client_id: clientId,
      trigger_snapshot: payload as never,
      status: "running",
    })
    .select("id")
    .maybeSingle();

  if (runError) {
    return NextResponse.json({ error: runError.message }, { status: 500 });
  }

  // No row back means the duplicate-active-run guard on automation_runs
  // silently skipped this insert (this client already has one running) --
  // not an error, just nothing new to start.
  if (!run) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  await supabase.rpc("start_next_automation_step", { p_run_id: run.id });

  return NextResponse.json({ ok: true, run_id: run.id });
}
