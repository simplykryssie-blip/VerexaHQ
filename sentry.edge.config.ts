// Sentry init for the Edge runtime (middleware.ts, any edge route
// handlers). Loaded by instrumentation.ts. A silent no-op until
// NEXT_PUBLIC_SENTRY_DSN is set -- see .env.local.example. Edge functions
// can't use lib/env.ts's getAppEnvironment() (it depends on @vercel/functions'
// Node-only getEnv()), so this reads the same public env var used
// client-side directly instead.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV ?? "development",
  tracesSampleRate: 0.1,
});
