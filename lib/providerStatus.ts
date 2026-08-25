// Server-side only. Each of these returns true once the corresponding
// environment variables are set in .env.local — nothing else needs to
// change in the app. Until then, the related feature falls back to its
// manual/tracking-only behavior.

export function isEmailConfigured() {
  return !!process.env.RESEND_API_KEY;
}

export function isSmsConfigured() {
  return (
    !!process.env.TWILIO_ACCOUNT_SID &&
    !!process.env.TWILIO_AUTH_TOKEN &&
    !!process.env.TWILIO_FROM_NUMBER
  );
}

export function isStripeConfigured() {
  return !!process.env.STRIPE_SECRET_KEY;
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
