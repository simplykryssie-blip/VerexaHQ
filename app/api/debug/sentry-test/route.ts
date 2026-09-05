import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

// Temporary, unauthenticated diagnostic route to confirm the Sentry pipeline
// (DSN -> deployed SDK -> project) is actually connected end to end, without
// requiring browser DevTools access. Remove this file once verified.
//
// Without this, Next.js statically optimizes this GET handler at build time
// (it has no dynamic dependency) and serves that one cached response to
// every request forever -- so the Sentry.captureException call below would
// only have actually run once, during the Vercel build, not on your visit.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    throw new Error("Sentry connectivity test -- safe to ignore, this route is removed after verification");
  } catch (error) {
    Sentry.captureException(error);
    await Sentry.flush(2000);
    return NextResponse.json({ ok: true, message: "Test error sent to Sentry" });
  }
}
