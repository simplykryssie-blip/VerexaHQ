import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmailViaResend, SYSTEM_SENDERS, type SystemSenderKey } from "@/lib/email/resend";
import { recordProviderCheck } from "@/lib/providerHealth";

function isSystemSenderKey(value: unknown): value is SystemSenderKey {
  return typeof value === "string" && value in SYSTEM_SENDERS;
}

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, sent: false, error: "Not authenticated" }, { status: 401 });
  }

  const { to, subject, html, sender } = (await request.json()) as {
    to?: string;
    subject?: string;
    html?: string;
    sender?: string;
  };
  if (!to || !subject || !html) {
    return NextResponse.json({ ok: false, sent: false, error: "to, subject, and html are required" }, { status: 400 });
  }

  const result = await sendEmailViaResend({ to, subject, html, ...(isSystemSenderKey(sender) ? { sender } : {}) });
  if (result.reason === undefined) {
    await recordProviderCheck("email", result.sent, result.error);
  }
  return NextResponse.json({ ok: true, ...result });
}
