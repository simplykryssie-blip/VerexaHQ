import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentWorkspace, workspaceOperationalError } from "@/lib/workspace";
import { updateSubscriptionItemQuantity } from "@/lib/stripe/client";

/**
 * Removes an active paid seat -- stops future recurring billing only.
 * No refund, no credit, no proration on the decrease (updateSubscriptionItemQuantity
 * is always proration_behavior "none"), matching the locked "no backward
 * money movement" rule. Deliberately does not touch any workspace_users
 * row -- seat removal and staff release are separate actions.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return NextResponse.json({ error: "No active workspace" }, { status: 400 });
  }
  if (workspace.status === "suspended") {
    return NextResponse.json({ error: workspaceOperationalError(workspace) }, { status: 403 });
  }

  const { seatId } = (await request.json().catch(() => ({}))) as { seatId?: string };
  if (!seatId) {
    return NextResponse.json({ error: "seatId is required" }, { status: 400 });
  }

  const { data: seat, error } = await supabase.rpc("release_paid_seat", { p_workspace_id: workspace.id, p_seat_id: seatId });
  if (error || !seat) {
    return NextResponse.json({ error: error?.message ?? "Could not remove seat" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: subscription } = await service
    .from("workspace_subscriptions")
    .select("seat_addon_subscription_item_id")
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  if (subscription?.seat_addon_subscription_item_id) {
    const { count: activeCount } = await service
      .from("workspace_paid_seats")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .eq("status", "active");
    await updateSubscriptionItemQuantity({
      subscriptionItemId: subscription.seat_addon_subscription_item_id,
      quantity: activeCount ?? 0,
    });
  }

  return NextResponse.json({ ok: true });
}
