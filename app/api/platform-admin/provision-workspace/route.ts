import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// Self-serve signup is closed (create_workspace's EXECUTE grant was
// revoked from authenticated/anon/public -- see the
// lock_self_serve_signup migration). This is the only way a new
// workspace gets created now: a platform admin picks the email and
// account tier, we create the login and the workspace together, and
// Supabase's invite email lets them set their own password -- the
// "send the email + account level, they do a password reset" flow the
// user asked for, using the purpose-built mechanism for it instead of a
// manual workaround.
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: isPlatformAdmin } = await supabase.rpc("is_platform_admin");
  if (!isPlatformAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const firstName = typeof body?.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body?.lastName === "string" ? body.lastName.trim() : "";
  const workspaceName = typeof body?.workspaceName === "string" ? body.workspaceName.trim() : "";
  const workspaceType = typeof body?.workspaceType === "string" ? body.workspaceType : "independent_ptin";

  if (!email || !workspaceName) {
    return NextResponse.json({ error: "Email and workspace name are required" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL is not configured" }, { status: 500 });
  }

  const serviceClient = createServiceClient();

  const { data: invited, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${appUrl}/auth/confirm?next=/reset-password`,
    data: { first_name: firstName, last_name: lastName },
  });

  if (inviteError || !invited.user) {
    return NextResponse.json({ error: inviteError?.message ?? "Could not invite this user" }, { status: 400 });
  }

  const { data: workspaceId, error: workspaceError } = await serviceClient.rpc("create_workspace", {
    p_name: workspaceName,
    p_workspace_type: workspaceType,
    p_owner_user_id: invited.user.id,
  });

  if (workspaceError || !workspaceId) {
    // The auth user now exists without a workspace -- surface the real
    // error so it can be fixed (e.g. re-run workspace creation) rather
    // than leaving a silent half-provisioned account with no explanation.
    return NextResponse.json(
      { error: `Login created, but the workspace failed: ${workspaceError?.message ?? "unknown error"}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ userId: invited.user.id, workspaceId });
}
