import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCheckoutSession } from "@/lib/stripe/client";
import { isStripeConfigured } from "@/lib/providerStatus";
import { recordProviderCheck } from "@/lib/providerHealth";
import { checkRateLimit } from "@/lib/rateLimit";
import { getCurrentWorkspace } from "@/lib/workspace";
import { getAppUrl } from "@/lib/appUrl";

// Fixed pack sizes only -- a client can't submit an arbitrary unit count
// and have it priced trustingly. Price comes from the workspace's own plan
// overage rate, so it's always the same per-unit rate already shown on
// Platform Admin > Plans (cost-covered with margin over Resend/Twilio/Supabase).
const PACKS: Record<"email" | "sms" | "storage", { units: number; label: string }[]> = {
  email: [
    { units: 1000, label: "1,000 emails" },
    { units: 5000, label: "5,000 emails" },
  ],
  sms: [
    { units: 250, label: "250 text messages" },
    { units: 1000, label: "1,000 text messages" },
  ],
  storage: [
    { units: 10, label: "10 GB storage" },
    { units: 50, label: "50 GB storage" },
  ],
};

const RATE_COLUMN: Record<"email" | "sms" | "storage", "email_overage_rate_cents" | "sms_overage_rate_cents" | "storage_overage_rate_cents"> = {
  email: "email_overage_rate_cents",
  sms: "sms_overage_rate_cents",
  storage: "storage_overage_rate_cents",
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

  const body = (await request.json()) as { resourceType?: string; units?: number };
  const resourceType = body.resourceType;
  if (resourceType !== "email" && resourceType !== "sms" && resourceType !== "storage") {
    return NextResponse.json({ error: "resourceType must be email, sms, or storage" }, { status: 400 });
  }

  const pack = PACKS[resourceType].find((p) => p.units === body.units);
  if (!pack) {
    return NextResponse.json({ error: "units must match an available pack size" }, { status: 400 });
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
  const amountCents = pack.units * rateCents;
  const appUrl = getAppUrl(request);

  const result = await createCheckoutSession({
    amount: amountCents / 100,
    description: `Verexa usage top-up -- ${pack.label}`,
    successUrl: `${appUrl}/settings/plan-usage?topup=1`,
    cancelUrl: `${appUrl}/settings/plan-usage?topup=0`,
    metadata: { type: "usage_topup", workspace_id: workspace.id, resource_type: resourceType, units: String(pack.units) },
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
