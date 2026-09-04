export type AppEnvironment = "development" | "staging" | "production";

/**
 * Server-only. Vercel sets VERCEL_ENV automatically: "production" for the
 * Production deployment, "preview" for every preview deployment (mapped to
 * "staging" here since preview deployments point at the isolated staging
 * Supabase project -- see .env.local.example). Also checks VERCEL_TARGET_ENV,
 * Vercel's newer parallel signal (introduced for custom environments), in
 * case a given deployment ever populates that but not VERCEL_ENV. Local
 * `next dev`, where neither is set, falls through to "development".
 */
export function getAppEnvironment(): AppEnvironment {
  const vercelEnv = process.env.VERCEL_ENV ?? process.env.VERCEL_TARGET_ENV;
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
