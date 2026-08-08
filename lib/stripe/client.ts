import { isStripeConfigured } from "@/lib/providerStatus";

const STRIPE_API = "https://api.stripe.com/v1";

function authHeaders(connectedAccountId?: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (connectedAccountId) {
    headers["Stripe-Account"] = connectedAccountId;
  }
  return headers;
}

function toFormBody(params: Record<string, string | number | undefined>) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) body.set(key, String(value));
  }
  return body;
}

export type StripeResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export async function createCheckoutSession({
  amount,
  currency = "usd",
  description,
  successUrl,
  cancelUrl,
  metadata,
  connectedAccountId,
}: {
  amount: number;
  currency?: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  connectedAccountId: string;
}): Promise<StripeResult<{ id: string; url: string }>> {
  if (!isStripeConfigured()) {
    return { ok: false, reason: "Stripe is not configured for this environment." };
  }

  const body = toFormBody({
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    "line_items[0][price_data][currency]": currency,
    "line_items[0][price_data][product_data][name]": description,
    "line_items[0][price_data][unit_amount]": Math.round(amount * 100),
    "line_items[0][quantity]": 1,
  });
  for (const [key, value] of Object.entries(metadata)) {
    body.set(`metadata[${key}]`, value);
  }

  const res = await fetch(`${STRIPE_API}/checkout/sessions`, { method: "POST", headers: authHeaders(connectedAccountId), body });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Stripe responded with ${res.status}: ${text}` };
  }
  const data = (await res.json()) as { id: string; url: string };
  return { ok: true, data };
}

export async function createRefund({
  paymentIntentId,
  amount,
  connectedAccountId,
}: {
  paymentIntentId: string;
  amount?: number;
  connectedAccountId: string;
}): Promise<StripeResult<{ id: string; status: string }>> {
  if (!isStripeConfigured()) {
    return { ok: false, reason: "Stripe is not configured for this environment." };
  }

  const body = toFormBody({
    payment_intent: paymentIntentId,
    amount: amount !== undefined ? Math.round(amount * 100) : undefined,
  });

  const res = await fetch(`${STRIPE_API}/refunds`, { method: "POST", headers: authHeaders(connectedAccountId), body });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Stripe responded with ${res.status}: ${text}` };
  }
  const data = (await res.json()) as { id: string; status: string };
  return { ok: true, data };
}

/**
 * Creates a new Standard Connect account for a workspace. The platform's own
 * key is used here (no Stripe-Account header) since account creation is a
 * platform-level operation, not one scoped to a connected account.
 */
export async function createConnectedAccount({
  email,
  workspaceId,
}: {
  email?: string;
  workspaceId: string;
}): Promise<StripeResult<{ id: string }>> {
  if (!isStripeConfigured()) {
    return { ok: false, reason: "Stripe is not configured for this environment." };
  }

  const body = toFormBody({
    type: "standard",
    email,
    "metadata[workspace_id]": workspaceId,
  });

  const res = await fetch(`${STRIPE_API}/accounts`, { method: "POST", headers: authHeaders(), body });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Stripe responded with ${res.status}: ${text}` };
  }
  const data = (await res.json()) as { id: string };
  return { ok: true, data };
}

export async function createAccountLink({
  accountId,
  refreshUrl,
  returnUrl,
}: {
  accountId: string;
  refreshUrl: string;
  returnUrl: string;
}): Promise<StripeResult<{ url: string }>> {
  if (!isStripeConfigured()) {
    return { ok: false, reason: "Stripe is not configured for this environment." };
  }

  const body = toFormBody({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });

  const res = await fetch(`${STRIPE_API}/account_links`, { method: "POST", headers: authHeaders(), body });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Stripe responded with ${res.status}: ${text}` };
  }
  const data = (await res.json()) as { url: string };
  return { ok: true, data };
}

export async function fetchAccount(
  accountId: string
): Promise<StripeResult<{ charges_enabled: boolean; payouts_enabled: boolean; details_submitted: boolean }>> {
  if (!isStripeConfigured()) {
    return { ok: false, reason: "Stripe is not configured for this environment." };
  }

  const res = await fetch(`${STRIPE_API}/accounts/${accountId}`, { method: "GET", headers: authHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Stripe responded with ${res.status}: ${text}` };
  }
  const data = (await res.json()) as { charges_enabled: boolean; payouts_enabled: boolean; details_submitted: boolean };
  return { ok: true, data };
}

/**
 * Mirrors Stripe's own account-status semantics: "active" once both charges
 * and payouts are enabled, "restricted" if Stripe finished reviewing details
 * but is withholding charges/payouts (e.g. more info requested), otherwise
 * "pending" while onboarding is still in progress.
 */
export function deriveConnectStatus(
  chargesEnabled: boolean,
  payoutsEnabled: boolean,
  detailsSubmitted: boolean
): "pending" | "active" | "restricted" {
  if (chargesEnabled && payoutsEnabled) return "active";
  if (detailsSubmitted && !chargesEnabled) return "restricted";
  return "pending";
}

/**
 * Moves a subscription item onto a new Price. Used for grandfathered price
 * migrations: called exactly once, at the renewal where a workspace's
 * locked price-change effective date has been reached, never mid-cycle.
 */
export async function updateSubscriptionItemPrice({
  subscriptionItemId,
  priceId,
}: {
  subscriptionItemId: string;
  priceId: string;
}): Promise<StripeResult<{ id: string }>> {
  if (!isStripeConfigured()) {
    return { ok: false, reason: "Stripe is not configured for this environment." };
  }

  const body = toFormBody({ price: priceId, proration_behavior: "none" });
  const res = await fetch(`${STRIPE_API}/subscription_items/${subscriptionItemId}`, { method: "POST", headers: authHeaders(), body });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Stripe responded with ${res.status}: ${text}` };
  }
  const data = (await res.json()) as { id: string };
  return { ok: true, data };
}

/**
 * Verifies a Stripe webhook signature per Stripe's documented scheme
 * (t=<timestamp>,v1=<hmac>) without needing the stripe SDK.
 */
export async function verifyStripeSignature(payload: string, signatureHeader: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key, value];
    })
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const crypto = await import("crypto");
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);
  if (expectedBuf.length !== signatureBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}
