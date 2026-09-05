import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isSmsConfigured } from "@/lib/providerStatus";
import { checkRateLimit } from "@/lib/rateLimit";
import { getCurrentWorkspace } from "@/lib/workspace";

// Buys a real Twilio number and attaches it to the workspace -- the first
// one a workspace ever provisions is free (provision_phone_number_record
// decides that server-side); every one after costs $4.99/month, billed out
// of the workspace's SMS balance by bill_and_pause_phone_numbers. This
// spends real money with Twilio the moment it's called, so it's gated to
// the workspace owner and never triggered automatically.
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const allowed = await checkRateLimit(`phone-number-provision:${user.id}`, 5, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "No active workspace" }, { status: 400 });
  }
  if (!workspace.is_owner) {
    return NextResponse.json({ error: "Only the workspace owner can purchase a phone number." }, { status: 403 });
  }

  if (!isSmsConfigured()) {
    return NextResponse.json({ configured: false, reason: "SMS provider is not configured for this environment." }, { status: 200 });
  }

  const { areaCode } = (await request.json().catch(() => ({}))) as { areaCode?: string };

  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const authToken = process.env.TWILIO_AUTH_TOKEN!;
  const authHeader = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;

  const searchParams = new URLSearchParams({ SmsEnabled: "true", VoiceEnabled: "true" });
  if (areaCode) searchParams.set("AreaCode", areaCode);

  const searchRes = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/AvailablePhoneNumbers/US/Local.json?${searchParams.toString()}`,
    { headers: { Authorization: authHeader } }
  );
  if (!searchRes.ok) {
    const text = await searchRes.text().catch(() => "");
    return NextResponse.json({ error: `Twilio number search failed: ${searchRes.status} ${text}` }, { status: 502 });
  }
  const searchData = (await searchRes.json()) as { available_phone_numbers?: { phone_number: string }[] };
  const candidate = searchData.available_phone_numbers?.[0];
  if (!candidate) {
    return NextResponse.json({ error: areaCode ? `No numbers available in area code ${areaCode}.` : "No numbers available right now." }, { status: 404 });
  }

  const purchaseRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json`, {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ PhoneNumber: candidate.phone_number }),
  });
  if (!purchaseRes.ok) {
    const text = await purchaseRes.text().catch(() => "");
    return NextResponse.json({ error: `Twilio purchase failed: ${purchaseRes.status} ${text}` }, { status: 502 });
  }
  const purchased = (await purchaseRes.json()) as { sid: string; phone_number: string };

  const service = createServiceClient();
  const { data: row, error } = await service
    .rpc("provision_phone_number_record", {
      p_workspace_id: workspace.id,
      p_phone_number: purchased.phone_number,
      p_twilio_sid: purchased.sid,
    })
    .single();

  if (error) {
    return NextResponse.json({ error: `Number purchased but couldn't be saved: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ configured: true, phoneNumber: row });
}
