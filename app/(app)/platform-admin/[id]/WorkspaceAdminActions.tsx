"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

type Plan = { id: string; name: string };

export function WorkspaceStatusActions({ workspaceId, status }: { workspaceId: string; status: string }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("billing_past_due");

  async function suspend() {
    setBusy(true);
    const { error } = await supabase.rpc("set_workspace_status", {
      p_workspace_id: workspaceId,
      p_status: "suspended",
      p_suspension_reason: reason,
    });
    setBusy(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Workspace suspended", "success");
    router.refresh();
  }

  async function reactivate() {
    if (!window.confirm("Reactivate this workspace?")) return;
    setBusy(true);
    const { error } = await supabase.rpc("set_workspace_status", { p_workspace_id: workspaceId, p_status: "active" });
    setBusy(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Workspace reactivated", "success");
    router.refresh();
  }

  if (status === "suspended") {
    return (
      <button
        type="button"
        onClick={reactivate}
        disabled={busy}
        className="rounded-lg border border-success px-3 py-1.5 text-xs font-medium text-success hover:bg-success/10 disabled:opacity-60"
      >
        {busy ? "Working..." : "Reactivate workspace"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="rounded-lg border border-border px-2 py-1.5 text-xs text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      >
        <option value="billing_past_due">Billing past due</option>
        <option value="subscription_canceled">Subscription canceled</option>
      </select>
      <button
        type="button"
        onClick={suspend}
        disabled={busy}
        className="rounded-lg border border-danger px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/10 disabled:opacity-60"
      >
        {busy ? "Working..." : "Suspend workspace"}
      </button>
    </div>
  );
}

export function AssignSubscriptionForm({
  workspaceId,
  plans,
  currentPlanId,
  currentStatus,
  currentSeatCount,
}: {
  workspaceId: string;
  plans: Plan[];
  currentPlanId: string | null;
  currentStatus: string | null;
  currentSeatCount: number | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [planId, setPlanId] = useState(currentPlanId ?? plans[0]?.id ?? "");
  const [stripeStatus, setStripeStatus] = useState(currentStatus ?? "active");
  const [seatCount, setSeatCount] = useState(String(currentSeatCount ?? 1));
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!planId) {
      toast.show("Choose a plan first.", "error");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("upsert_workspace_subscription", {
      p_workspace_id: workspaceId,
      p_plan_id: planId,
      p_stripe_status: stripeStatus,
      p_seat_count: parseInt(seatCount, 10) || 1,
    });
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Subscription saved", "success");
    router.refresh();
  }

  if (plans.length === 0) {
    return <p className="text-sm text-muted">Create a plan first to assign one to this workspace.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
      <select
        value={planId}
        onChange={(e) => setPlanId(e.target.value)}
        className="rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      >
        {plans.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <select
        value={stripeStatus}
        onChange={(e) => setStripeStatus(e.target.value)}
        className="rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      >
        {["incomplete", "trialing", "active", "past_due", "unpaid", "canceled"].map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <input
        type="number"
        min={1}
        value={seatCount}
        onChange={(e) => setSeatCount(e.target.value)}
        placeholder="Seats"
        className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
      >
        {saving ? "Saving..." : "Save subscription"}
      </button>
    </div>
  );
}
