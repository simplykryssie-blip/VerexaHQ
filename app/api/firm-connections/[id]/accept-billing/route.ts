import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace, workspaceOperationalError, isWorkspaceStatusOperational } from "@/lib/workspace";
import { getSubscriptionPrimaryItemId, updateSubscriptionItemQuantity } from "@/lib/stripe/client";
import { hasAal2 } from "@/lib/auth/requireAal2";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isWorkspaceStatusOperational(workspace.status)) {
    return NextResponse.json({ error: workspaceOperationalError(workspace) }, { status: 403 });
  }

  const supabase = createClient();

  // VEREXA-AAL-001: accepting billing responsibility changes who pays for a
  // connected firm -- a password-only session must not be sufficient on
  // its own.
  if (!(await hasAal2(supabase))) {
    return NextResponse.json(
      { error: "This action requires two-factor verification. Complete your authenticator challenge and try again." },
      { status: 403 }
    );
  }

  const { data: connection, error } = await supabase.rpc("accept_firm_connection_billing", { p_connection_id: params.id });
  if (error || !connection) {
    return NextResponse.json({ error: error?.message ?? "Could not accept billing for this connection." }, { status: 400 });
  }

  const { data: subscription } = await supabase
    .from("workspace_subscriptions")
    .select("stripe_subscription_id, seat_count")
    .eq("workspace_id", connection.parent_workspace_id)
    .maybeSingle();

  let stripeSync: { ok: boolean; reason?: string } = { ok: true };
  if (subscription?.stripe_subscription_id) {
    const itemResult = await getSubscriptionPrimaryItemId(subscription.stripe_subscription_id);
    if (itemResult.ok) {
      const quantityResult = await updateSubscriptionItemQuantity({
        subscriptionItemId: itemResult.data.id,
        quantity: subscription.seat_count ?? 1,
      });
      stripeSync = quantityResult.ok ? { ok: true } : { ok: false, reason: quantityResult.reason };
    } else {
      stripeSync = { ok: false, reason: itemResult.reason };
    }
  }

  return NextResponse.json({ connection, stripeSync });
}
