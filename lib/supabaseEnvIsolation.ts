// VEREXA-ENV-001: this file deliberately has ZERO dependency on
// @vercel/functions (or anything else Node-only). It's imported directly
// by Edge middleware (lib/supabase/middleware.ts), which cannot resolve
// the `ws` package that @vercel/functions's websocket helper pulls in --
// importing it (even indirectly, via lib/env.ts) broke the Edge build.
// Keep this file free of that import; lib/env.ts re-exports everything
// here for its own (Node-only) consumers instead of duplicating it.

export type AppEnvironment = "development" | "staging" | "production";

// Preview must never be able to read or write Production's Supabase
// project, and vice versa. These two refs are the only two Supabase
// projects this app is ever meant to talk to, and are committed here --
// not read from a Vercel env var -- so the check below can't be bypassed
// by a dashboard misconfiguration; it ships with the code and is reviewed
// in PR. Neither value is a secret (both already appear in
// .env.local.example and in NEXT_PUBLIC_SUPABASE_URL itself, which is
// sent to every browser).
const PRODUCTION_SUPABASE_PROJECT_REF = "daxpavvsotvsyqqntddc";
const STAGING_SUPABASE_PROJECT_REF = "uzdlqioslnqqikiouksg";

const SUPABASE_URL_PATTERN = /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/;

function parseSupabaseProjectRef(url: string | undefined | null): string | null {
  if (!url) return null;
  const match = SUPABASE_URL_PATTERN.exec(url.trim());
  return match ? match[1] : null;
}

/**
 * Edge-safe mirror of lib/env.ts's getAppEnvironment(). Edge Middleware
 * can't import @vercel/functions (see the file-level comment above), but
 * Vercel injects VERCEL_ENV into process.env for Edge Middleware at
 * runtime the same way it does for Node functions, so a plain process.env
 * read works here without that package. Same three-way mapping as
 * getAppEnvironment(); an unrecognized or missing value deliberately falls
 * through to "development" (never "production"), so a misconfigured or
 * undetectable environment can never silently be treated as
 * production-safe. Use this only from Edge code (middleware); use
 * getAppEnvironment() from Node/server code and getBrowserAppEnvironment()
 * from the browser.
 */
export function getEdgeAppEnvironment(): AppEnvironment {
  const vercelEnv = process.env.VERCEL_ENV ?? process.env.VERCEL_TARGET_ENV;
  if (vercelEnv === "production") return "production";
  if (vercelEnv === "preview") return "staging";
  return "development";
}

/**
 * Browser-safe mirror of the same mapping. getAppEnvironment() reads
 * VERCEL_ENV via getEnv()/process.env, neither of which is exposed to
 * client bundles -- only NEXT_PUBLIC_-prefixed vars are inlined by Next's
 * build. NEXT_PUBLIC_VERCEL_ENV is the Vercel/Next.js-provided mirror of
 * VERCEL_ENV meant for exactly this: client code that needs to know which
 * deployment target it's running in. Use this (not getAppEnvironment())
 * from any file that can run in the browser, e.g. lib/supabase/client.ts.
 */
export function getBrowserAppEnvironment(): AppEnvironment {
  const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV;
  if (vercelEnv === "production") return "production";
  if (vercelEnv === "preview") return "staging";
  return "development";
}

/**
 * Throws unless the configured Supabase URL belongs to the Supabase
 * project this deployment (per `appEnv`) is allowed to use. Call this
 * before constructing ANY Supabase client -- browser, server, middleware,
 * or service-role -- passing getAppEnvironment() from Node/server code,
 * getEdgeAppEnvironment() from Edge middleware, or getBrowserAppEnvironment()
 * from browser code. A deployment that fails this check must fail closed
 * (throw), never silently construct a client against the wrong project.
 * See VEREXA-ENV-001.
 */
export function assertSupabaseProjectMatchesEnvironment(url: string | undefined | null, appEnv: AppEnvironment): void {
  const ref = parseSupabaseProjectRef(url);

  if (!ref) {
    throw new Error(`Refusing to start: NEXT_PUBLIC_SUPABASE_URL ("${url ?? ""}") is missing or is not a valid Supabase project URL.`);
  }

  if (ref === PRODUCTION_SUPABASE_PROJECT_REF && appEnv !== "production") {
    throw new Error(
      `Refusing to start: this is a "${appEnv}" deployment but NEXT_PUBLIC_SUPABASE_URL points at the PRODUCTION Supabase project (${PRODUCTION_SUPABASE_PROJECT_REF}). Non-production environments must never use the production project.`
    );
  }

  if (appEnv === "production" && ref !== PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error(
      `Refusing to start: this is the production deployment but NEXT_PUBLIC_SUPABASE_URL points at a non-production Supabase project ("${ref}"), not ${PRODUCTION_SUPABASE_PROJECT_REF}.`
    );
  }
}

// Same payload-only JWT read already used by lib/supabase/middleware.ts's
// getSessionIssuedAt (a different claim, same Supabase JWT shape) -- no
// signature verification, matching that existing pattern exactly. atob()
// rather than Buffer so this also works from the Edge runtime (middleware).
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(base64));
    return typeof json === "object" && json !== null ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Throws unless SUPABASE_SERVICE_ROLE_KEY's own `ref` claim agrees with the
 * Supabase URL it's being paired with. assertSupabaseProjectMatchesEnvironment
 * only checks the URL against the deployment; this additionally catches a
 * Vercel-dashboard mistake where the right URL ends up paired with the
 * wrong project's service-role key (or vice versa). Never logs the key
 * itself -- only the two project refs, which aren't secrets.
 */
export function assertServiceRoleKeyMatchesProject(url: string | undefined | null, serviceRoleKey: string | undefined | null): void {
  const urlRef = parseSupabaseProjectRef(url);
  if (!urlRef) {
    throw new Error(`Refusing to start: NEXT_PUBLIC_SUPABASE_URL ("${url ?? ""}") is missing or is not a valid Supabase project URL.`);
  }

  if (!serviceRoleKey) {
    throw new Error("Refusing to start: SUPABASE_SERVICE_ROLE_KEY is missing.");
  }

  const payload = decodeJwtPayload(serviceRoleKey);
  const keyRef = payload && typeof payload.ref === "string" ? payload.ref : null;

  if (!keyRef) {
    throw new Error("Refusing to start: SUPABASE_SERVICE_ROLE_KEY is malformed -- could not read its project reference.");
  }

  if (keyRef !== urlRef) {
    throw new Error(
      `Refusing to start: SUPABASE_SERVICE_ROLE_KEY belongs to Supabase project "${keyRef}" but NEXT_PUBLIC_SUPABASE_URL points at "${urlRef}". These must match.`
    );
  }
}

// Exported for tests only, so they can assert against the same constants
// this module enforces against rather than duplicating the literal refs.
export const __ENV_ISOLATION_TEST_ONLY__ = {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
};
