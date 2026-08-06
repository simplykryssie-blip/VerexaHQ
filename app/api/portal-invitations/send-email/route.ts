import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { sendEmailViaResend } from "@/lib/email/resend";
import { renderPortalInviteEmail } from "@/lib/email/portalInvite";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return NextResponse.json({ ok: false, sent: false, error: "Not authenticated" }, { status: 401 });
  }

  const allowed = await checkRateLimit(`portal-invite-email:${workspace.id}`, 30, 60);
  if (!allowed) {
    return NextResponse.json({ ok: false, sent: false, error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const { clientId, invitedEmail, invitedName, acceptUrl } = (await request.json()) as {
    clientId?: string;
    invitedEmail?: string;
    invitedName?: string | null;
    acceptUrl?: string;
  };
  if (!clientId || !invitedEmail || !acceptUrl) {
    return NextResponse.json({ ok: false, sent: false, error: "clientId, invitedEmail, and acceptUrl are required" }, { status: 400 });
  }

  const supabase = createClient();

  const [{ data: template }, { data: workspaceRow }, { data: organizerResponses }] = await Promise.all([
    supabase
      .from("email_templates")
      .select("subject, body_html, workspace_id")
      .eq("slug", "portal-invite-email")
      .eq("status", "published")
      .or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`)
      .order("workspace_id", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("workspaces").select("phone, website, mailing_address, primary_contact_email").eq("id", workspace.id).single(),
    supabase
      .from("organizer_responses")
      .select("status, organizer_templates(name)")
      .eq("client_id", clientId)
      .neq("status", "completed"),
  ]);

  if (!template) {
    return NextResponse.json({ ok: false, sent: false, error: "Portal invite email template is missing." }, { status: 500 });
  }

  const clientFirstName = (invitedName ?? "").trim().split(/\s+/)[0] ?? "";

  const { subject, html } = renderPortalInviteEmail(
    { subject: template.subject, body: template.body_html },
    {
      clientFirstName,
      firmName: workspace.name,
      firmPhone: workspaceRow?.phone ?? null,
      firmEmail: workspaceRow?.primary_contact_email ?? null,
      firmWebsite: workspaceRow?.website ?? null,
      firmAddress: workspaceRow?.mailing_address ?? null,
      portalActivationUrl: acceptUrl,
      assignedOrganizerNames: (organizerResponses ?? [])
        .map((o: any) => o.organizer_templates?.name)
        .filter((n: unknown): n is string => Boolean(n)),
    }
  );

  const result = await sendEmailViaResend({ to: invitedEmail, subject, html, sender: "portal" });
  return NextResponse.json({ ok: true, ...result });
}
