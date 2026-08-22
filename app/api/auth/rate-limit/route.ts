import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";

const LIMITS = {
  login: { maxHits: 10, windowSeconds: 300 },
  "password-reset": { maxHits: 5, windowSeconds: 300 },
} as const;

export async function POST(request: Request) {
  const { action, email } = (await request.json()) as { action?: string; email?: string };

  if ((action !== "login" && action !== "password-reset") || typeof email !== "string" || !email) {
    return NextResponse.json({ allowed: true });
  }

  const limit = LIMITS[action];
  const allowed = await checkRateLimit(`${action}:${email.toLowerCase()}`, limit.maxHits, limit.windowSeconds);

  return NextResponse.json({ allowed });
}
