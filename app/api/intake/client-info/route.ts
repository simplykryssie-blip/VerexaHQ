import { NextRequest, NextResponse } from "next/server";
import { requestIp } from "@/lib/intakeRateLimit";

// Echoes the requester's own best-effort IP back to them, for the intake
// wizard to attach to its own submission acknowledgment (submit_intake's
// p_ip_address). This does not look anyone else up -- it only ever tells a
// caller its own address, the same as any "what's my IP" endpoint.
export async function GET(req: NextRequest) {
  return NextResponse.json({ ip: requestIp(req) });
}
