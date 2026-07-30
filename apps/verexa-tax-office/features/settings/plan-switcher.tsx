"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/errors";
import { toast } from "@/components/ui/toaster";
import { formatCurrency } from "@/lib/formatters";
import type { Tables } from "@/types/database";

export function PlanSwitcher({ subscriptionId, currentPlanId, plans }: { subscriptionId: string; currentPlanId: string; plans: Tables<"subscription_plans">[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState<string | null>(null);

  async function switchPlan(planId: string) {
    setBusy(planId);
    const { error } = await supabase.from("workspace_subscriptions").update({ plan_id: planId }).eq("id", subscriptionId);
    setBusy(null);
    if (error) {
      toast.error(friendlyDbError(error.message));
      return;
    }
    toast.success("Plan updated");
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {plans.map((plan) => {
        const isCurrent = plan.id === currentPlanId;
        return (
          <Card key={plan.id} className={isCurrent ? "border-brand" : ""}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                {plan.name}
                {isCurrent && <Badge variant="success">Current</Badge>}
              </CardTitle>
              <p className="text-2xl font-semibold">
                {formatCurrency(plan.monthly_price)}
                <span className="text-sm font-normal text-muted-foreground">/mo</span>
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{plan.description}</p>
              <ul className="space-y-1 text-xs">
                {((plan.features as string[]) ?? []).map((f) => (
                  <li key={f} className="flex items-start gap-1.5">
                    <Check className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" /> {f}
                  </li>
                ))}
              </ul>
              {!isCurrent && (
                <Button size="sm" variant="outline" disabled={busy === plan.id} onClick={() => switchPlan(plan.id)}>
                  {busy === plan.id && <Loader2 className="h-4 w-4 animate-spin" />}
                  Switch to {plan.name}
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
