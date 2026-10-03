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

  // VEREXA-AAL-001: disconnecting a firm connection changes an active
  // billing relationship -- a password-only session must not be
  // sufficient on its own.
  if (!(await hasAal2(supabase))) {
    return NextResponse.json(
      { error: "This action requires two-factor verification. Complete your authenticator challenge and try again." },
      { status: 403 }
    );
  }

  const { data: before } = await supabase.from("firm_connections").select("parent_workspace_id, billing_responsibility").eq("id", params.id).maybeSingle();

  const { error } = await supabase.rpc("disconnect_firm_connection", { p_connection_id: params.id });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  let stripeSync: { ok: boolean; reason?: string } = { ok: true };
  if (before?.billing_responsibility === "ero" && before.parent_workspace_id) {
    const { data: subscription } = await supabase
      .from("workspace_subscriptions")
      .select("stripe_subscription_id, seat_count")
      .eq("workspace_id", before.parent_workspace_id)
      .maybeSingle();

    if (subscription?.stripe_subscription_id) {
      const itemResult = await getSubscriptionPrimaryItemId(subscription.stripe_subscription_id);
      if (itemResult.ok) {
        const quantityResult = await updateSubscriptionItemQuantity({
          subscriptionItemId: itemResult.data.id,
          quantity: subscription.seat_count ?? 0,
        });
        stripeSync = quantityResult.ok ? { ok: true } : { ok: false, reason: quantityResult.reason };
      } else {
        stripeSync = { ok: false, reason: itemResult.reason };
      }
    }
  }

  return NextResponse.json({ ok: true, stripeSync });
}
