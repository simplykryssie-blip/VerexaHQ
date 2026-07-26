import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, requestIp } from "@/lib/intakeRateLimit";

// Public, unauthenticated, write-only sink for the intake pages' client-
// side error reporting. Logs only to the server console (Vercel function
// logs) -- never persisted, never echoed back, never includes anything
// beyond a short truncated error message/code and a caller-supplied
// context label. Rate-limited so this can't be abused as a log-flooding
// vector; over the limit, it silently no-ops rather than erroring, since
// losing an occasional diagnostic line is harmless and this must never be
// something an attacker can use to signal anything back to the client.
export async function POST(req: NextRequest) {
  const ip = requestIp(req);
  if (isRateLimited(`log-error:${ip}`, 30, 10 * 60 * 1000)) {
    return NextResponse.json({ ok: true });
  }

  const payload = (await req.json().catch(() => null)) as
    | { context?: string; code?: string; message?: string }
    | null;
  if (payload) {
    const context = typeof payload.context === "string" ? payload.context.slice(0, 100) : "unknown";
    const code = typeof payload.code === "string" ? payload.code.slice(0, 20) : "";
    const message = typeof payload.message === "string" ? payload.message.slice(0, 500) : "";
    console.error("[public-intake]", context, code, message);
  }

  return NextResponse.json({ ok: true });
}
