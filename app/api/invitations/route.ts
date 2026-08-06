import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { sendEmailViaResend } from "@/lib/email/resend";
import { renderEmail } from "@/lib/email/template";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (workspace.workspace_type === "independent_ptin") {
    return NextResponse.json(
      { error: "Independent PTIN workspaces can't add staff. Upgrade to an ERO Office or Service Bureau to invite team members." },
      { status: 403 }
    );
  }

  const allowed = await checkRateLimit(`invitations:${workspace.id}`, 10, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const { email, roleId } = (await request.json()) as { email?: string; roleId?: string };
  if (!email || !roleId) {
    return NextResponse.json({ error: "email and roleId are required" }, { status: 400 });
  }

  const supabase = createClient();
  const { data: invitation, error } = await supabase.rpc("create_workspace_invitation", {
    p_workspace_id: workspace.id,
    p_email: email,
    p_role_id: roleId,
  });

  if (error || !invitation) {
    return NextResponse.json({ error: error?.message ?? "Could not create invitation" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const acceptUrl = `${appUrl}/accept-invitation?token=${invitation.token}`;

  const emailResult = await sendEmailViaResend({
    to: email,
    sender: "team",
    subject: `You've been invited to join ${workspace.name} on VerexaHQ`,
    html: renderEmail({
      heading: `Join ${workspace.name} on VerexaHQ`,
      bodyHtml: `<p>You've been invited to join <strong>${workspace.name}</strong>&apos;s workspace on VerexaHQ.</p><p>Click below to accept the invitation and set up your account.</p>`,
      ctaLabel: "Accept invitation",
      ctaUrl: acceptUrl,
    }),
  });

  return NextResponse.json({ invitation, acceptUrl, email: emailResult });
}
