import { NextRequest, NextResponse } from "next/server";
import { isEmailConfigured, isSmsConfigured, isStripeConfigured } from "@/lib/providerStatus";
import { authenticateRequest } from "@/lib/serverAuth";

export async function GET(req: NextRequest) {
  try { await authenticateRequest(req); } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return NextResponse.json({ email: isEmailConfigured(), sms: isSmsConfigured(), stripe: isStripeConfigured() });
}
