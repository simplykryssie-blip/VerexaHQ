import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/workspace";

// Backs the Platform Admin sidebar's workspace switcher (home + the demo
// PTIN/ERO/SB shells) -- verifies real active membership before trusting a
// workspace id, then stashes it in a cookie that getCurrentWorkspace()
// reads on every subsequent request until switched again.
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const workspaceId = typeof body?.workspaceId === "string" ? body.workspaceId : "";
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from("workspace_users")
    .select("id")
    .eq("user_id", user.id)
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: "You are not a member of that workspace." }, { status: 403 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
