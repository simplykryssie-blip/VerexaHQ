import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/auth/workspace";
import { roleHasCapability } from "@/lib/permissions/capabilities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlanSwitcher } from "@/features/settings/plan-switcher";
import { formatDate } from "@/lib/formatters";

const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  trialing: "Trialing",
  active: "Active",
  past_due: "Past due",
  paused: "Paused",
  cancelled: "Cancelled",
  expired: "Expired",
};

export default async function SubscriptionPage() {
  const active = await getActiveWorkspace();
  if (!active) redirect("/workspaces");
  if (!roleHasCapability(active.role, "manage_workspace")) redirect("/unauthorized");

  const supabase = await createClient();
  const [{ data: subscription }, { data: plans }, { count: staffCount }, { count: clientCount }] = await Promise.all([
    supabase.from("workspace_subscriptions").select("*, plan:subscription_plans(*)").eq("workspace_id", active.workspace.id).maybeSingle(),
    supabase.from("subscription_plans").select("*").eq("is_active", true).order("monthly_price"),
    supabase.from("workspace_members").select("id", { count: "exact", head: true }).eq("workspace_id", active.workspace.id).eq("status", "active"),
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("workspace_id", active.workspace.id).is("archived_at", null),
  ]);

  const plan = subscription?.plan as { name?: string; max_staff?: number | null; max_clients?: number | null } | null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Subscription</h1>
        <p className="text-sm text-muted-foreground mt-1">No payment processor is connected yet — plan changes take effect immediately without billing you.</p>
      </div>

      {subscription && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current subscription</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Plan</div>
              <div className="font-medium">{plan?.name ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Status</div>
              <Badge variant={subscription.status === "active" || subscription.status === "trialing" ? "success" : "destructive"}>
                {SUBSCRIPTION_STATUS_LABELS[subscription.status] ?? subscription.status}
              </Badge>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Staff</div>
              <div className="font-medium">
                {staffCount ?? 0}
                {plan?.max_staff ? ` / ${plan.max_staff}` : ""}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Clients</div>
              <div className="font-medium">
                {clientCount ?? 0}
                {plan?.max_clients ? ` / ${plan.max_clients}` : ""}
              </div>
            </div>
            {subscription.trial_ends_at && (
              <div>
                <div className="text-xs text-muted-foreground">Trial ends</div>
                <div className="font-medium">{formatDate(subscription.trial_ends_at)}</div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {subscription && plans && <PlanSwitcher subscriptionId={subscription.id} currentPlanId={subscription.plan_id} plans={plans} />}
    </div>
  );
}
