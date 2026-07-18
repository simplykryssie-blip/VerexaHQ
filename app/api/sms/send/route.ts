import { NextRequest, NextResponse } from "next/server";
import { isSmsConfigured } from "@/lib/providerStatus";
import { authenticateRequest } from "@/lib/serverAuth";

export async function POST(req: NextRequest) {
  try { await authenticateRequest(req); } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const payload = await req.json().catch(() => null) as { to?: string; body?: string } | null;
  const to = payload?.to?.trim();
  const body = payload?.body?.trim();
  if (!to || !body || body.length > 1600) {
    return NextResponse.json({ ok: false, error: "Invalid SMS request." }, { status: 400 });
  }
  if (!isSmsConfigured()) {
    return NextResponse.json({ ok: false, sent: false, reason: "SMS delivery is not configured." }, { status: 503 });
  }
  try {
    const twilioModule = await import("twilio");
    const client = twilioModule.default(process.env.TWILIO_ACCOUNT_SID as string, process.env.TWILIO_AUTH_TOKEN as string);
    const message = await client.messages.create({ to, from: process.env.TWILIO_FROM_NUMBER as string, body });
    return NextResponse.json({ ok: true, sent: true, sid: message.sid });
  } catch (error) {
    return NextResponse.json({ ok: false, sent: false, error: error instanceof Error ? error.message : "SMS delivery failed." }, { status: 500 });
  }
}
