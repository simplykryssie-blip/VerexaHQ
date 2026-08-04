import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isEmailConfigured, isSmsConfigured, isStripeConfigured } from "@/lib/providerStatus";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json({
    email: isEmailConfigured(),
    sms: isSmsConfigured(),
    stripe: isStripeConfigured(),
  });
}
