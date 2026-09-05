import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCheckoutSession } from "@/lib/stripe/client";
import { isStripeConfigured } from "@/lib/providerStatus";
import { recordProviderCheck } from "@/lib/providerHealth";
import { checkRateLimit } from "@/lib/rateLimit";
import { getCurrentWorkspace } from "@/lib/workspace";
import { getAppUrl } from "@/lib/appUrl";

// Workspaces top up by dollar amount, not a fixed pack size -- they buy
// whatever a given amount converts to at their plan's per-unit overage rate,
// and only when they actually need more (no recurring/automatic charge).
const MINIMUM_TOPUP_CENTS = 2500;

const RATE_COLUMN: Record<"email" | "sms" | "storage", "email_overage_rate_cents" | "sms_overage_rate_cents" | "storage_overage_rate_cents"> = {
  email: "email_overage_rate_cents",
  sms: "sms_overage_rate_cents",
  storage: "storage_overage_rate_cents",
};

const RESOURCE_LABEL: Record<"email" | "sms" | "storage", string> = {
  email: "emails",
  sms: "text messages",
  storage: "GB storage",
};

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const allowed = await checkRateLimit(`usage-topup-checkout:${user.id}`, 10, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "No active workspace" }, { status: 400 });
  }
  if (!workspace.is_owner) {
    return NextResponse.json({ error: "Only the workspace owner can purchase usage top-ups." }, { status: 403 });
  }

  const body = (await request.json()) as { resourceType?: string; amountCents?: number };
  const resourceType = body.resourceType;
  if (resourceType !== "email" && resourceType !== "sms" && resourceType !== "storage") {
    return NextResponse.json({ error: "resourceType must be email, sms, or storage" }, { status: 400 });
  }

  const amountCents = body.amountCents;
  if (amountCents === undefined || !Number.isInteger(amountCents) || amountCents < MINIMUM_TOPUP_CENTS) {
    return NextResponse.json({ error: `Top-ups start at $${(MINIMUM_TOPUP_CENTS / 100).toFixed(2)}.` }, { status: 400 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({ configured: false, reason: "Stripe is not configured for this environment." }, { status: 200 });
  }

  const { data: subscription } = await supabase
    .from("workspace_subscriptions")
    .select("stripe_status, platform_subscription_plans(email_overage_rate_cents, sms_overage_rate_cents, storage_overage_rate_cents)")
    .eq("workspace_id", workspace.id)
    .maybeSingle();
  const plan = subscription?.platform_subscription_plans as {
    email_overage_rate_cents: number;
    sms_overage_rate_cents: number;
    storage_overage_rate_cents: number;
  } | null;
  if (!subscription || subscription.stripe_status !== "active" || !plan) {
    return NextResponse.json({ error: "This workspace isn't on an active paid plan." }, { status: 400 });
  }

  const rateCents = plan[RATE_COLUMN[resourceType]];
  if (!rateCents || rateCents <= 0) {
    return NextResponse.json({ error: "This plan doesn't have an overage rate configured for that resource." }, { status: 400 });
  }
  const units = amountCents / rateCents;
  const appUrl = getAppUrl(request);

  const result = await createCheckoutSession({
    amount: amountCents / 100,
    description: `Verexa usage top-up -- ~${units.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${RESOURCE_LABEL[resourceType]}`,
    successUrl: `${appUrl}/settings/plan-usage?topup=1`,
    cancelUrl: `${appUrl}/settings/plan-usage?topup=0`,
    metadata: { type: "usage_topup", workspace_id: workspace.id, resource_type: resourceType, units: units.toFixed(6) },
  });

  if (!result.ok) {
    if (result.reason !== "Stripe is not configured for this environment.") {
      await recordProviderCheck("stripe", false, result.reason);
    }
    return NextResponse.json({ configured: false, reason: result.reason }, { status: 200 });
  }
  await recordProviderCheck("stripe", true);

  return NextResponse.json({ configured: true, url: result.data.url });
}
