import { isStripeConfigured } from "@/lib/providerStatus";

const STRIPE_API = "https://api.stripe.com/v1";

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
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
}: {
  amount: number;
  currency?: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
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

  const res = await fetch(`${STRIPE_API}/checkout/sessions`, { method: "POST", headers: authHeaders(), body });
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
}: {
  paymentIntentId: string;
  amount?: number;
}): Promise<StripeResult<{ id: string; status: string }>> {
  if (!isStripeConfigured()) {
    return { ok: false, reason: "Stripe is not configured for this environment." };
  }

  const body = toFormBody({
    payment_intent: paymentIntentId,
    amount: amount !== undefined ? Math.round(amount * 100) : undefined,
  });

  const res = await fetch(`${STRIPE_API}/refunds`, { method: "POST", headers: authHeaders(), body });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `Stripe responded with ${res.status}: ${text}` };
  }
  const data = (await res.json()) as { id: string; status: string };
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
