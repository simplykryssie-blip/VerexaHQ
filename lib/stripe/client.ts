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

// Every Stripe subscription Verexa creates today (the platform base
// subscription and firm-connection billing takeover, both via
// createSubscriptionCheckoutSession's single inline price_data line item)
// has exactly one item -- there is no seat-billing or other multi-item
// subscription in production yet. Rather than blindly indexing
// items.data[0] (which would silently act on the wrong item the moment a
// second one exists), every call site that needs "the" item goes through
// this: it requires there to genuinely be exactly one and fails safely
// otherwise, so a future multi-item subscription surfaces as an explicit,
// actionable "ambiguous" result instead of silently modifying the wrong
// item.
export function getSoleSubscriptionItem<T>(items: T[]): StripeResult<T> {
  if (items.length === 0) {
    return { ok: false, reason: "This subscription has no items." };
  }
  if (items.length > 1) {
    return { ok: false, reason: "This subscription has multiple items; a specific item must be identified explicitly rather than assumed." };
  }
  return { ok: true, data: items[0] };
}

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
  // Omit for a platform-level charge (Verexa charging the workspace itself,
  // e.g. a usage top-up) -- only set this for a Connect direct charge on a
  // workspace's own connected account (its client paying its invoice).
  connectedAccountId?: string;
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

/**
 * Same shape as createCheckoutSession but mode "subscription" with an
 * ad-hoc recurring price (no pre-made Stripe Price object needed, since a
 * package's price is set per-tenant, not from a fixed catalog). A
 * subscription has no PaymentIntent at session-creation time, so its
 * metadata goes on subscription_data instead of payment_intent_data.
 */
export async function createSubscriptionCheckoutSession({
  amount,
  currency = "usd",
  description,
  interval,
  successUrl,
  cancelUrl,
  metadata,
  connectedAccountId,
}: {
  amount: number;
  currency?: string;
  description: string;
  interval: "month" | "year";
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  connectedAccountId?: string;
}): Promise<StripeResult<{ id: string; url: string }>> {
  if (!isStripeConfigured()) {
    return { ok: false, reason: "Stripe is not configured for this environment." };
  }

  const body = toFormBody({
    mode: "subscription",
    success_url: successUrl,
    cancel_url: cancelUrl,
    "line_items[0][price_data][currency]": currency,
    "line_items[0][price_data][product_data][name]": description,
    "line_items[0][price_data][unit_amount]": Math.round(amount * 100),
    "line_items[0][price_data][recurring][interval]": interval,
    "line_items[0][quantity]": 1,
  });
  for (const [key, value] of Object.entries(metadata)) {
    body.set(`metadata[${key}]`, value);
    body.set(`subscription_data[metadata][${key}]`, value);
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
  const itemResult = getSoleSubscriptionItem(data.items.data);
  if (!itemResult.ok) return itemResult;
  return { ok: true, data: { id: itemResult.data.id } };
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
 * Hosted, redirect-based card collection for a platform subscription --
 * mode "setup" saves a payment method against the customer without
 * charging anything, same Checkout-redirect pattern as createCheckoutSession
 * above (mode "payment") rather than embedding Stripe Elements client-side.
 */
export async function createSetupCheckoutSession({
  customerId,
  successUrl,
  cancelUrl,
  metadata,
}: {
  customerId: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}): Promise<StripeResult<{ id: string; url: string }>> {
  if (!isStripeConfigured()) {
    return { ok: false, reason: "Stripe is not configured for this environment." };
  }

  const body = toFormBody({
    mode: "setup",
    customer: customerId,
    success_url: successUrl,
    cancel_url: cancelUrl,
    "payment_method_types[0]": "card",
  });
  for (const [key, value] of Object.entries(metadata)) {
    body.set(`metadata[${key}]`, value);
  }

  const res = await fetch(`${STRIPE_API}/checkout/sessions`, { method: "POST", headers: authHeaders(), body });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Stripe responded with ${res.status}: ${text}` };
  }
  const data = (await res.json()) as { id: string; url: string };
  return { ok: true, data };
}

/** Resolves a completed setup Checkout session down to the saved payment method's id. */
export async function retrieveSetupIntentPaymentMethod(setupIntentId: string): Promise<StripeResult<{ paymentMethodId: string }>> {
  if (!isStripeConfigured()) {
    return { ok: false, reason: "Stripe is not configured for this environment." };
  }

  const res = await fetch(`${STRIPE_API}/setup_intents/${setupIntentId}`, { headers: authHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Stripe responded with ${res.status}: ${text}` };
  }
  const data = (await res.json()) as { payment_method: string | null };
  if (!data.payment_method) {
    return { ok: false, reason: "Setup intent has no payment method attached." };
  }
  return { ok: true, data: { paymentMethodId: data.payment_method } };
}

export async function retrieveCardDetails(paymentMethodId: string): Promise<StripeResult<{ brand: string; last4: string; expMonth: number; expYear: number }>> {
  if (!isStripeConfigured()) {
    return { ok: false, reason: "Stripe is not configured for this environment." };
  }

  const res = await fetch(`${STRIPE_API}/payment_methods/${paymentMethodId}`, { headers: authHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Stripe responded with ${res.status}: ${text}` };
  }
  const data = (await res.json()) as { card?: { brand: string; last4: string; exp_month: number; exp_year: number } };
  if (!data.card) {
    return { ok: false, reason: "Payment method has no card details." };
  }
  return { ok: true, data: { brand: data.card.brand, last4: data.card.last4, expMonth: data.card.exp_month, expYear: data.card.exp_year } };
}

export async function setCustomerDefaultPaymentMethod({
  customerId,
  paymentMethodId,
}: {
  customerId: string;
  paymentMethodId: string;
}): Promise<StripeResult<true>> {
  if (!isStripeConfigured()) {
    return { ok: false, reason: "Stripe is not configured for this environment." };
  }

  const body = toFormBody({ "invoice_settings[default_payment_method]": paymentMethodId });
  const res = await fetch(`${STRIPE_API}/customers/${customerId}`, { method: "POST", headers: authHeaders(), body });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Stripe responded with ${res.status}: ${text}` };
  }
  return { ok: true, data: true };
}

/** Previews what the next renewal invoice would total, without generating a real invoice -- used to know the amount for a pre-cycle charge attempt. */
export async function previewUpcomingInvoiceAmount(stripeSubscriptionId: string): Promise<StripeResult<{ amountDueCents: number; currency: string }>> {
  if (!isStripeConfigured()) {
    return { ok: false, reason: "Stripe is not configured for this environment." };
  }

  const params = new URLSearchParams({ subscription: stripeSubscriptionId });
  const res = await fetch(`${STRIPE_API}/invoices/upcoming?${params.toString()}`, { headers: authHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Stripe responded with ${res.status}: ${text}` };
  }
  const data = (await res.json()) as { amount_due: number; currency: string };
  return { ok: true, data: { amountDueCents: data.amount_due, currency: data.currency } };
}

/**
 * Staff-seat billing: previews exactly what Stripe would prorate for
 * adding/incrementing the dedicated seat subscription item, without
 * mutating the live subscription (read-only -- safe to call as many times
 * as needed while the admin is deciding). Sums only the line items Stripe
 * itself flags as `proration: true`, rather than trusting the preview's
 * top-level amount_due (which reflects the whole upcoming invoice and
 * could include unrelated unbilled items) -- this is what keeps the seat
 * charge isolated to just this change.
 *
 * existingItemId null means this is the workspace's first paid seat ever
 * (no dedicated item exists yet); Stripe previews it as a new price_data
 * line item. Never assumes items.data[0] -- the item is always identified
 * by its own stored id, or explicitly absent.
 */
export async function previewSeatProrationAmount({
  stripeSubscriptionId,
  existingItemId,
  priceCents,
  newQuantity,
}: {
  stripeSubscriptionId: string;
  existingItemId: string | null;
  priceCents: number;
  newQuantity: number;
}): Promise<StripeResult<{ amountCents: number; currency: string }>> {
  if (!isStripeConfigured()) {
    return { ok: false, reason: "Stripe is not configured for this environment." };
  }

  const params = new URLSearchParams({ subscription: stripeSubscriptionId });
  if (existingItemId) {
    params.set("subscription_items[0][id]", existingItemId);
  } else {
    params.set("subscription_items[0][price_data][currency]", "usd");
    params.set("subscription_items[0][price_data][product_data][name]", "Additional staff seat");
    params.set("subscription_items[0][price_data][unit_amount]", String(priceCents));
    params.set("subscription_items[0][price_data][recurring][interval]", "month");
  }
  params.set("subscription_items[0][quantity]", String(newQuantity));

  const res = await fetch(`${STRIPE_API}/invoices/upcoming?${params.toString()}`, { headers: authHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Stripe responded with ${res.status}: ${text}` };
  }
  const data = (await res.json()) as { currency: string; lines: { data: { amount: number; proration: boolean }[] } };
  const amountCents = data.lines.data.filter((line) => line.proration).reduce((sum, line) => sum + line.amount, 0);
  return { ok: true, data: { amountCents, currency: data.currency } };
}

/**
 * Staff-seat billing: creates the dedicated seat subscription item on
 * first use, or updates its quantity thereafter. Always proration_behavior
 * "none" -- the prorated amount for an increase was already collected as
 * an isolated direct charge via chargeOffSession (see
 * previewSeatProrationAmount's doc comment for why), and a decrease must
 * never generate a Stripe-side credit. Never assumes items.data[0] -- the
 * item is created once and its id is the only thing ever targeted again.
 */
export async function ensureSeatSubscriptionItemQuantity({
  stripeSubscriptionId,
  existingItemId,
  priceCents,
  quantity,
}: {
  stripeSubscriptionId: string;
  existingItemId: string | null;
  priceCents: number;
  quantity: number;
}): Promise<StripeResult<{ id: string }>> {
  if (!isStripeConfigured()) {
    return { ok: false, reason: "Stripe is not configured for this environment." };
  }

  if (existingItemId) {
    return updateSubscriptionItemQuantity({ subscriptionItemId: existingItemId, quantity });
  }

  const body = toFormBody({
    subscription: stripeSubscriptionId,
    "price_data[currency]": "usd",
    "price_data[product_data][name]": "Additional staff seat",
    "price_data[unit_amount]": priceCents,
    "price_data[recurring][interval]": "month",
    quantity,
    proration_behavior: "none",
  });
  const res = await fetch(`${STRIPE_API}/subscription_items`, { method: "POST", headers: authHeaders(), body });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Stripe responded with ${res.status}: ${text}` };
  }
  const data = (await res.json()) as { id: string };
  return { ok: true, data: { id: data.id } };
}

/**
 * Off-session charge against a saved card -- used for the pre-cycle
 * (3-days-early) dunning attempt, not a customer-present checkout. A
 * decline surfaces as a non-2xx response with an error payload rather than
 * a thrown exception.
 */
export async function chargeOffSession({
  customerId,
  paymentMethodId,
  amountCents,
  currency = "usd",
  description,
  metadata,
  idempotencyKey,
}: {
  customerId: string;
  paymentMethodId: string;
  amountCents: number;
  currency?: string;
  description: string;
  metadata: Record<string, string>;
  // Optional: when a caller can retry the exact same charge (e.g. a cron
  // tick that might re-run before its own bookkeeping catches up), passing
  // a stable key here makes Stripe return the SAME PaymentIntent instead of
  // creating a second charge -- see the auto-topup cron for why that
  // matters when the charge and the resulting balance credit aren't the
  // same atomic step.
  idempotencyKey?: string;
}): Promise<StripeResult<{ id: string; status: string }>> {
  if (!isStripeConfigured()) {
    return { ok: false, reason: "Stripe is not configured for this environment." };
  }
  if (amountCents <= 0) {
    return { ok: true, data: { id: "zero-amount", status: "succeeded" } };
  }

  const body = toFormBody({
    customer: customerId,
    payment_method: paymentMethodId,
    amount: amountCents,
    currency,
    description,
    off_session: "true",
    confirm: "true",
  });
  for (const [key, value] of Object.entries(metadata)) {
    body.set(`metadata[${key}]`, value);
  }

  const headers = authHeaders();
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const res = await fetch(`${STRIPE_API}/payment_intents`, { method: "POST", headers, body });
  const data = (await res.json().catch(() => ({}))) as { id?: string; status?: string; error?: { message?: string; decline_code?: string } };
  if (!res.ok || !data.id) {
    return { ok: false, reason: data.error?.decline_code ?? data.error?.message ?? `Stripe responded with ${res.status}` };
  }
  return { ok: true, data: { id: data.id, status: data.status ?? "unknown" } };
}

/**
 * Credits a successful early charge to the customer's Stripe balance rather
 * than trying to suppress or reschedule the subscription's own invoice --
 * Stripe automatically applies any available balance credit to the next
 * invoice before charging the card, so the real renewal invoice nets to $0
 * and every existing subscription webhook keeps working unchanged.
 */
export async function createCustomerBalanceCredit({
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

  const body = toFormBody({ amount: -Math.abs(amountCents), currency, description });
  const res = await fetch(`${STRIPE_API}/customers/${customerId}/balance_transactions`, { method: "POST", headers: authHeaders(), body });
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
