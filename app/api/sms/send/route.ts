import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendSmsViaTwilio } from "@/lib/sms/twilio";
import { recordProviderCheck } from "@/lib/providerHealth";
import { checkRateLimit } from "@/lib/rateLimit";

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, sent: false, error: "Not authenticated" }, { status: 401 });
  }

  const allowed = await checkRateLimit(`sms-send:${user.id}`, 20, 60);
  if (!allowed) {
    return NextResponse.json({ ok: false, sent: false, error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const { to, body } = (await request.json()) as { to?: string; body?: string };
  if (!to || !body) {
    return NextResponse.json({ ok: false, sent: false, error: "to and body are required" }, { status: 400 });
  }

  const result = await sendSmsViaTwilio({ to, body });
  if (result.reason === undefined) {
    await recordProviderCheck("sms", result.sent, result.error);
  }
  return NextResponse.json({ ok: true, ...result });
}
