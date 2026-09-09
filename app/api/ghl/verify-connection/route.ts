import { NextResponse } from "next/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

// Real bug this closes: GhlConnectionCard used to save whatever was typed
// into the Location ID field straight to workspace_ghl_connections with no
// check that it actually works, then showed a green "Connected" badge
// regardless. A firm that pasted their support email into that field (an
// easy mistake -- GHL's own docs call it a "Location ID" with no format
// shown anywhere in this app) got no error until they later tried to
// actually import contacts and GoHighLevel rejected the request. This does
// the same lookup the real import uses (GET /contacts with limit=1) before
// anything is saved, so a bad token or location ID fails immediately with
// GoHighLevel's own reason instead of silently.
export async function POST(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createClient();
  const { data: isAdmin } = await supabase.rpc("is_workspace_admin", { p_workspace_id: workspace.id });
  if (!isAdmin) {
    return NextResponse.json({ ok: false, error: "insufficient permissions to connect GoHighLevel for this workspace" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { apiKey?: string; locationId?: string } | null;
  const apiKey = body?.apiKey?.trim();
  const locationId = body?.locationId?.trim();
  if (!apiKey || !locationId) {
    return NextResponse.json({ ok: false, error: "Paste both your Private Integration Token and Location ID." }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(`${GHL_BASE}/contacts/?locationId=${encodeURIComponent(locationId)}&limit=1`, {
      headers: { Authorization: `Bearer ${apiKey}`, Version: GHL_VERSION, Accept: "application/json" },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not reach GoHighLevel. Check your connection and try again." }, { status: 502 });
  }

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    const ghlMessage = (json as { message?: string })?.message;
    const hint =
      res.status === 401 || res.status === 403
        ? "Double-check the Private Integration Token."
        : "Double-check the Location ID -- it's the alphanumeric code under GHL Settings > Business Profile, not an email address or business name.";
    return NextResponse.json(
      { ok: false, error: ghlMessage ? `GoHighLevel rejected this: ${ghlMessage}. ${hint}` : `GoHighLevel rejected this connection (${res.status}). ${hint}` },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
