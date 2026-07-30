import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/errors";

// Invites a not-yet-registered user to a workspace. Requires the admin
// API because workspace_members.user_id is NOT NULL — there is no
// "pending invite by email" row type in this schema, so the auth.users
// row has to exist before a membership row can reference it. Every
// authorization check below runs against the caller's own session
// (never trusting the request body) before the service-role client is
// ever touched.
export async function POST(request: Request) {
  const { workspaceId, email, role } = await request.json();
  if (!workspaceId || !email || !role) {
    return NextResponse.json({ error: "Missing workspaceId, email, or role." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    return NextResponse.json({ error: "Only owners and admins can invite team members." }, { status: 403 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Invites aren't available in this environment (service role not configured)." }, { status: 503 });
  }

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/sign-in`,
  });

  if (inviteError || !invited.user) {
    logServerError("team invite", inviteError);
    const message = (inviteError?.message ?? "").toLowerCase();
    if (message.includes("already been registered") || message.includes("already registered")) {
      return NextResponse.json({ error: "That email is already registered. Add them to the workspace from the Team page instead." }, { status: 409 });
    }
    return NextResponse.json({ error: "Couldn't send the invite. Please try again." }, { status: 500 });
  }

  const { error: memberError } = await admin.from("workspace_members").insert({
    workspace_id: workspaceId,
    user_id: invited.user.id,
    role,
    status: "invited",
    invited_by: user.id,
  });

  if (memberError) {
    logServerError("team invite membership insert", memberError);
    return NextResponse.json({ error: "Invite email sent, but adding them to the workspace failed. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
