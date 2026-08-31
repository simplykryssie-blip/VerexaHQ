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
    // Session metadata doesn't carry over to the PaymentIntent it creates --
    // set it there too so a payment_intent.payment_failed webhook (a card
    // decline, not just an abandoned session) can still resolve which
    // invoice/plan it belongs to.
    body.set(`payment_intent_data[metadata][${key}]`, value);
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
 * Exchanges a Standard Connect OAuth authorization code for the connected
 * account's ID. Used when a workspace links its own already-existing Stripe
 * account (as opposed to createConnectedAccount, which creates a brand-new
 * one) -- this is the flow Stripe's OAuth "Connect with Stripe" button uses.
 */
export async function exchangeOAuthCode(code: string): Promise<StripeResult<{ stripeUserId: string }>> {
  if (!isStripeConfigured()) {
    return { ok: false, reason: "Stripe is not configured for this environment." };
  }

  const body = toFormBody({ grant_type: "authorization_code", code, client_secret: process.env.STRIPE_SECRET_KEY });
  const res = await fetch("https://connect.stripe.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json().catch(() => ({}))) as { stripe_user_id?: string; error_description?: string };
  if (!res.ok || !data.stripe_user_id) {
    return { ok: false, reason: data.error_description ?? `Stripe responded with ${res.status}` };
  }
  return { ok: true, data: { stripeUserId: data.stripe_user_id } };
}

/** Revokes the platform's OAuth access to a connected account -- the counterpart to exchangeOAuthCode. */
export async function deauthorizeOAuthAccount(stripeUserId: string): Promise<StripeResult<true>> {
  if (!isStripeConfigured()) {
    return { ok: false, reason: "Stripe is not configured for this environment." };
  }
  if (!process.env.STRIPE_CONNECT_CLIENT_ID) {
    return { ok: false, reason: "Stripe Connect is not configured for this environment." };
  }

  const body = toFormBody({ client_id: process.env.STRIPE_CONNECT_CLIENT_ID, stripe_user_id: stripeUserId });
  const res = await fetch("https://connect.stripe.com/oauth/deauthorize", { method: "POST", headers: authHeaders(), body });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Stripe responded with ${res.status}: ${text}` };
  }
  return { ok: true, data: true };
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

// Connected-PTIN seat sync doesn't have a cached subscription-item id lying
// around (unlike the webhook-driven price-change path above, which reads it
// straight off the webhook payload), so this fetches it fresh each time --
// simpler than adding a column to keep in sync.
export async function getSubscriptionPrimaryItemId(stripeSubscriptionId: string): Promise<StripeResult<{ id: string }>> {
  if (!isStripeConfigured()) {
    return { ok: false, reason: "Stripe is not configured for this environment." };
  }

  const res = await fetch(`${STRIPE_API}/subscriptions/${stripeSubscriptionId}`, { headers: authHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Stripe responded with ${res.status}: ${text}` };
  }
  const data = (await res.json()) as { items: { data: { id: string }[] } };
  const itemId = data.items.data[0]?.id;
  if (!itemId) {
    return { ok: false, reason: "This subscription has no items." };
  }
  return { ok: true, data: { id: itemId } };
}

export type CustomerDefaultPaymentMethod = { brand: string; last4: string; expMonth: number; expYear: number } | null;

// Platform billing has no local copy of card details -- checked live against
// Stripe rather than caching brand/last4 from a webhook, since the Billing
// tab only calls this for a handful of workspace subscriptions per page load.
export async function getCustomerDefaultPaymentMethod(stripeCustomerId: string): Promise<StripeResult<CustomerDefaultPaymentMethod>> {
  if (!isStripeConfigured()) {
    return { ok: false, reason: "Stripe is not configured for this environment." };
  }

  const params = new URLSearchParams({ "expand[]": "invoice_settings.default_payment_method" });
  const res = await fetch(`${STRIPE_API}/customers/${stripeCustomerId}?${params.toString()}`, { headers: authHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Stripe responded with ${res.status}: ${text}` };
  }
  const data = (await res.json()) as {
    invoice_settings?: { default_payment_method?: { card?: { brand: string; last4: string; exp_month: number; exp_year: number } } | null };
  };
  const card = data.invoice_settings?.default_payment_method?.card;
  if (!card) return { ok: true, data: null };
  return { ok: true, data: { brand: card.brand, last4: card.last4, expMonth: card.exp_month, expYear: card.exp_year } };
}

export async function updateSubscriptionItemQuantity({
  subscriptionItemId,
  quantity,
}: {
  subscriptionItemId: string;
  quantity: number;
}): Promise<StripeResult<{ id: string }>> {
  if (!isStripeConfigured()) {
    return { ok: false, reason: "Stripe is not configured for this environment." };
  }

  const body = toFormBody({ quantity, proration_behavior: "none" });
  const res = await fetch(`${STRIPE_API}/subscription_items/${subscriptionItemId}`, { method: "POST", headers: authHeaders(), body });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Stripe responded with ${res.status}: ${text}` };
  }
  const data = (await res.json()) as { id: string };
  return { ok: true, data };
}

/**
 * Adds a one-off line item to a customer's account for usage-overage
 * billing. Stripe rolls it into that customer's next regularly scheduled
 * invoice automatically -- no separate invoice-creation call needed.
 */
export async function createInvoiceItem({
  customerId,
  amountCents,
  currency = "usd",
  description,
}: {
  customerId: string;
  amountCents: number;
  currency?: string;
  description: string;
}): Promise<StripeResult<{ id: string }>> {
  if (!isStripeConfigured()) {
    return { ok: false, reason: "Stripe is not configured for this environment." };
  }

  const body = toFormBody({ customer: customerId, amount: amountCents, currency, description });
  const res = await fetch(`${STRIPE_API}/invoiceitems`, { method: "POST", headers: authHeaders(), body });
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
