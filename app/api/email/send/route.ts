import { NextRequest, NextResponse } from "next/server";
import { isEmailConfigured } from "@/lib/providerStatus";
import { authenticateRequest } from "@/lib/serverAuth";

export async function POST(req: NextRequest) {
  try { await authenticateRequest(req); } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const payload = await req.json().catch(() => null) as { to?: string; subject?: string; html?: string } | null;
  const to = payload?.to?.trim();
  const subject = payload?.subject?.trim();
  const html = payload?.html?.trim();
  if (!to || !subject || !html || subject.length > 300 || html.length > 200000) {
    return NextResponse.json({ ok: false, error: "Invalid email request." }, { status: 400 });
  }
  if (!isEmailConfigured()) {
    return NextResponse.json({ ok: false, sent: false, reason: "Email delivery is not configured." }, { status: 503 });
  }
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({ from: process.env.EMAIL_FROM_ADDRESS as string, to, subject, html });
    if (error) return NextResponse.json({ ok: false, sent: false, error: error.message }, { status: 502 });
    return NextResponse.json({ ok: true, sent: true, id: data?.id });
  } catch (error) {
    return NextResponse.json({ ok: false, sent: false, error: error instanceof Error ? error.message : "Email delivery failed." }, { status: 500 });
  }
}
