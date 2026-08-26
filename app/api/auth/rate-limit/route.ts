import { NextResponse } from "next/server";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";

const LIMITS = {
  login: { maxHits: 10, windowSeconds: 300 },
  "password-reset": { maxHits: 5, windowSeconds: 300 },
  signup: { maxHits: 5, windowSeconds: 3600 },
} as const;

export async function POST(request: Request) {
  const { action, email } = (await request.json()) as { action?: string; email?: string };

  if ((action !== "login" && action !== "password-reset" && action !== "signup") || typeof email !== "string" || !email) {
    return NextResponse.json({ allowed: true });
  }

  const limit = LIMITS[action];
  const allowed = await checkRateLimit(`${action}:${email.toLowerCase()}`, limit.maxHits, limit.windowSeconds);
  if (!allowed) return NextResponse.json({ allowed: false });

  // Signup can create a real workspace -- also cap by IP so one visitor
  // can't spin up many workspaces by cycling through different emails.
  if (action === "signup") {
    const ipAllowed = await checkRateLimit(`signup-ip:${clientIp(request)}`, 10, 3600);
    if (!ipAllowed) return NextResponse.json({ allowed: false });
  }

  return NextResponse.json({ allowed });
}
