import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmailViaResend } from "@/lib/email/resend";
import { renderEmail } from "@/lib/email/template";

export async function POST(request: Request) {
  const appUrl = new URL(request.url).origin;
  const supabase = createClient();

  const { data: isPlatformAdmin } = await supabase.rpc("is_platform_admin");
  if (!isPlatformAdmin) {
    return NextResponse.json({ error: "insufficient permissions to change platform IT status" }, { status: 403 });
  }

  const { email } = (await request.json().catch(() => null)) as { email?: string } | null ?? {};
  if (!email?.trim()) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  const { data: result, error } = await supabase.rpc("grant_or_invite_platform_it", { p_email: email.trim() });
  if (error || !result) {
    return NextResponse.json({ error: error?.message ?? "Could not grant IT access" }, { status: 400 });
  }

  const outcome = result as { granted: boolean; invitation?: { token: string } };
  if (outcome.granted) {
    return NextResponse.json({ granted: true });
  }

  const token = outcome.invitation?.token;
  const acceptUrl = `${appUrl}/accept-invitation?token=${token}`;

  const emailResult = await sendEmailViaResend({
    to: email.trim(),
    sender: "team",
    subject: "You've been invited to VerexaHQ",
    html: renderEmail({
      heading: "Join Verexa HQ CRM",
      bodyHtml:
        "<p>You've been invited to create a VerexaHQ account with IT tools access -- system health, job queues, and the workspace roster for troubleshooting.</p><p>Click below to accept the invitation and set up your account.</p>",
      ctaLabel: "Accept invitation",
      ctaUrl: acceptUrl,
    }),
  });

  return NextResponse.json({ granted: false, acceptUrl, email: emailResult });
}
