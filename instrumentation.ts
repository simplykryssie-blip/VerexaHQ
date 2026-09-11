// Next.js instrumentation hook -- runs once per server/edge runtime before
// anything else, which is how Sentry's Node/Edge SDKs get initialized here
// instead of at the top of every route file. See sentry.server.config.ts /
// sentry.edge.config.ts for the actual init calls (both no-ops until
// NEXT_PUBLIC_SENTRY_DSN is set).
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
