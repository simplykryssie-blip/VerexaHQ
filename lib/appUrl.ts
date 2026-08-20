/**
 * Resolves the app's own base URL for building redirect/callback links from a
 * server route. Prefers NEXT_PUBLIC_APP_URL (needed for Zoom/Stripe redirect
 * URIs, which must exactly match what's registered with those providers), but
 * falls back to the incoming request's own origin rather than a hardcoded
 * localhost -- so a missing env var in production degrades to "still the
 * real domain" instead of silently sending users to localhost.
 */
export function getAppUrl(request?: Request): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (request) return new URL(request.url).origin;
  return "http://localhost:3000";
}
