// Sentry init for the Node.js server runtime (route handlers, server
// components, cron routes). Loaded by instrumentation.ts. A silent no-op
// until NEXT_PUBLIC_SENTRY_DSN is set -- see .env.local.example.
import * as Sentry from "@sentry/nextjs";
import { getAppEnvironment } from "@/lib/env";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: getAppEnvironment(),
  tracesSampleRate: 0.1,
});
