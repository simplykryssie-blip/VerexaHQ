import { isProductionEnvironment } from "@/lib/env";

/**
 * Resolves the app's own base URL for building redirect/callback links from a
 * server route. In Production, prefers NEXT_PUBLIC_APP_URL (needed for
 * Zoom/Stripe redirect URIs, which must exactly match what's registered with
 * those providers), falling back to the incoming request's own origin rather
 * than a hardcoded localhost -- so a missing env var in production degrades
 * to "still the real domain" instead of silently sending users to localhost.
 *
 * Outside Production (Preview, local dev), always prefers the request's own
 * origin over NEXT_PUBLIC_APP_URL -- that env var is one fixed value across
 * every environment (the production domain), and a Preview deployment has
 * its own distinct URL per branch. Proven live: a Preview-mode Stripe
 * Checkout redirected to production on completion (NEXT_PUBLIC_APP_URL, not
 * the Preview origin), landing the browser on a different app instance
 * entirely -- and since Preview and Production share one database, that
 * instance then tried to operate on the just-created TEST-mode Stripe
 * customer with its own LIVE key, which Stripe correctly rejected as a mode
 * mismatch.
 */
export function getAppUrl(request?: Request): string {
  if (!isProductionEnvironment() && request) return new URL(request.url).origin;

  // Trailing slash stripped so callers can always safely do `${getAppUrl()}/path` --
  // a NEXT_PUBLIC_APP_URL configured with one (e.g. "https://verexahq.com/")
  // would otherwise silently double up into "https://verexahq.com//path" in every
  // link built from it (portal invites, organizer links, etc.).
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  if (request) return new URL(request.url).origin;
  return "http://localhost:3000";
}
