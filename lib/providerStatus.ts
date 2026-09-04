// Server-side only. Each of these returns true once the corresponding
// environment variables are set in .env.local — nothing else needs to
// change in the app. Until then, the related feature falls back to its
// manual/tracking-only behavior.
//
// isEmailConfigured/isSmsConfigured/isStripeConfigured additionally require
// liveSendsAllowed() (see lib/env.ts) -- outside Production these report
// "not configured" even if a live key is present, so a test account in
// Staging or a local checkout never sends a real email/SMS or moves real
// money (and, since signature-request notifications ride the same email
// path, never sends a real signature request either).

import { liveSendsAllowed } from "@/lib/env";

export function isEmailConfigured() {
  return liveSendsAllowed() && !!process.env.RESEND_API_KEY;
}

export function isSmsConfigured() {
  return (
    liveSendsAllowed() &&
    !!process.env.TWILIO_ACCOUNT_SID &&
    !!process.env.TWILIO_AUTH_TOKEN &&
    !!process.env.TWILIO_FROM_NUMBER
  );
}

export function isStripeConfigured() {
  return liveSendsAllowed() && !!process.env.STRIPE_SECRET_KEY;
}

/** Connect (linking a workspace's own Stripe account) additionally needs the platform's OAuth client ID. */
export function isStripeConnectConfigured() {
  return isStripeConfigured() && !!process.env.STRIPE_CONNECT_CLIENT_ID;
}

export function isZoomConfigured() {
  return !!process.env.ZOOM_CLIENT_ID && !!process.env.ZOOM_CLIENT_SECRET;
}

export function isVercelDomainAutomationConfigured() {
  return !!process.env.VERCEL_API_TOKEN;
}
