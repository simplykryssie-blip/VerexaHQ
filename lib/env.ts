import { getEnv } from "@vercel/functions";

export type AppEnvironment = "development" | "staging" | "production";

/**
 * Server-only. In production, VERCEL_ENV/VERCEL_TARGET_ENV weren't reliably
 * present on plain process.env for this project's serverless runtime (a real
 * live request logged everything else correctly but read those as
 * undefined) -- Vercel's own docs point at `getEnv()` from `@vercel/functions`
 * as the supported way to read System Environment Variables now, so that's
 * the primary source here, with process.env as a fallback for any context
 * where the package isn't wired up the same way (e.g. local `next dev`,
 * where neither source has it and this falls through to "development").
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
