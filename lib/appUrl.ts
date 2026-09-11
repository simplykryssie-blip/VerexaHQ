/**
 * Resolves the app's own base URL for building redirect/callback links from a
 * server route. Prefers NEXT_PUBLIC_APP_URL (needed for Zoom/Stripe redirect
 * URIs, which must exactly match what's registered with those providers), but
 * falls back to the incoming request's own origin rather than a hardcoded
 * localhost -- so a missing env var in production degrades to "still the
 * real domain" instead of silently sending users to localhost.
 */
export function getAppUrl(request?: Request): string {
  // Trailing slash stripped so callers can always safely do `${getAppUrl()}/path` --
  // a NEXT_PUBLIC_APP_URL configured with one (e.g. "https://verexahq.com/")
  // would otherwise silently double up into "https://verexahq.com//path" in every
  // link built from it (portal invites, organizer links, etc.).
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  if (request) return new URL(request.url).origin;
  return "http://localhost:3000";
}
