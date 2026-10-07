import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { createSetupCheckoutSession } from "@/lib/stripe/client";
import { hasAal2, AAL2_REQUIRED_RESPONSE_BODY, AAL2_REQUIRED_STATUS } from "@/lib/auth/requireAal2";

export async function POST(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createClient();
  const { data: isAdmin } = await supabase.rpc("is_workspace_admin", { p_workspace_id: workspace.id });
  if (!isAdmin) {
    return NextResponse.json({ error: "Only a workspace admin can update the billing card." }, { status: 403 });
  }

  // VEREXA-AAL-001: changing the billing card is a payment-configuration
  // action -- a password-only session must not be sufficient on its own.
  if (!(await hasAal2(supabase))) {
    return NextResponse.json(AAL2_REQUIRED_RESPONSE_BODY, { status: AAL2_REQUIRED_STATUS });
  }

  const { data: sub } = await supabase.from("workspace_subscriptions").select("stripe_customer_id").eq("workspace_id", workspace.id).maybeSingle();
  if (!sub?.stripe_customer_id) {
    return NextResponse.json({ error: "This workspace doesn't have an active subscription yet." }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const result = await createSetupCheckoutSession({
    customerId: sub.stripe_customer_id,
    successUrl: `${origin}/settings/plan-usage?card=added`,
    cancelUrl: `${origin}/settings/plan-usage?card=cancelled`,
    metadata: { workspace_id: workspace.id },
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 400 });
  }

  return NextResponse.json({ url: result.data.url });
}
