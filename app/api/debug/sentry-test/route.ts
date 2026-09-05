import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

// Temporary, unauthenticated diagnostic route to confirm the Sentry pipeline
// (DSN -> deployed SDK -> project) is actually connected end to end, without
// requiring browser DevTools access. Remove this file once verified.
export async function GET() {
  try {
    throw new Error("Sentry connectivity test -- safe to ignore, this route is removed after verification");
  } catch (error) {
    Sentry.captureException(error);
    await Sentry.flush(2000);
    return NextResponse.json({ ok: true, message: "Test error sent to Sentry" });
  }
}
