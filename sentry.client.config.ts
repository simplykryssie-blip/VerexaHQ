// This file configures the Sentry browser SDK. It runs once on the client
// whenever the app boots, in every environment -- but Sentry.init() is a
// silent no-op with an empty/undefined dsn, so nothing is captured or sent
// anywhere until NEXT_PUBLIC_SENTRY_DSN is actually set (see
// .env.local.example). No other gating is needed.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  // Low default so a busy production workspace doesn't burn through a free
  // Sentry plan's event quota on performance data alone -- raise this once
  // you have a paid plan and want deeper tracing.
  tracesSampleRate: 0.1,
});
