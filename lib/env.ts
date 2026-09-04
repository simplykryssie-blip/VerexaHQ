import { getEnv } from "@vercel/functions";

export type AppEnvironment = "development" | "staging" | "production";

/**
 * Server-only. Reads VERCEL_ENV via `getEnv()` from `@vercel/functions`
 * (Vercel's supported way to read System Environment Variables), falling
 * back to process.env for any context where the package isn't wired up the
 * same way. Requires the project's "Automatically expose System
 * Environment Variables" setting to be on (Vercel dashboard > Settings >
 * Environment Variables) -- with it off, VERCEL_ENV is never injected and
 * this always falls through to "development", even on a real deployment.
 * Local `next dev` also has neither source and falls through the same way.
 */
export function getAppEnvironment(): AppEnvironment {
  const env = getEnv();
  const vercelEnv = env.VERCEL_ENV ?? process.env.VERCEL_ENV ?? process.env.VERCEL_TARGET_ENV;
  if (vercelEnv === "production") return "production";
  if (vercelEnv === "preview") return "staging";
  return "development";
}

export function isProductionEnvironment(): boolean {
  return getAppEnvironment() === "production";
}

/**
 * True in Production, or outside it only when explicitly opted into via
 * ALLOW_LIVE_SENDS_OUTSIDE_PRODUCTION=true -- an escape hatch for a
 * developer deliberately testing a real send against their own inbox/phone,
 * never the default. Guards every outbound email/SMS/payment call (see
 * lib/providerStatus.ts) so staging or a local checkout can never silently
 * email, text, or charge a real person just because a live provider key
 * happens to be present in that environment.
 */
export function liveSendsAllowed(): boolean {
  return isProductionEnvironment() || process.env.ALLOW_LIVE_SENDS_OUTSIDE_PRODUCTION === "true";
}
