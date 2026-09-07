"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/Button";
import type { OptionGroupRow } from "@/components/settings/PackageOptionGroupsEditor";

export type PackagePurchaseRow = {
  status: string;
  billing_cadence: string | null;
  amount: number | null;
  selected_option_ids: string[] | null;
  current_period_end: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Checkout started -- finish payment to activate",
  active: "Active",
  past_due: "Payment past due",
  canceled: "Canceled",
};

function cadenceLabel(cadence: string | null) {
  if (cadence === "monthly") return "/ month";
  if (cadence === "annual") return "/ year";
  return "one time";
}

export function PackageCheckoutCard({
  connectionId,
  pkg,
  groups,
  purchase,
}: {
  connectionId: string;
  pkg: { id: string; name: string; description: string | null; flat_price: number | null; billing_cadence: string | null };
  groups: OptionGroupRow[];
  purchase: PackagePurchaseRow | null;
}) {
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const isLive = purchase && ["pending", "active", "past_due"].includes(purchase.status);

  function toggleOption(group: OptionGroupRow, optionId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      const groupOptionIds = new Set(group.options.map((o) => o.id));
      const selectedInGroup = [...next].filter((id) => groupOptionIds.has(id));
      if (next.has(optionId)) {
        next.delete(optionId);
      } else {
        if (group.max_select != null && selectedInGroup.length >= group.max_select) {
          if (group.max_select === 1) selectedInGroup.forEach((id) => next.delete(id));
          else return prev;
        }
        next.add(optionId);
      }
      return next;
    });
  }

  const invalidGroup = groups.find((g) => {
    const count = g.options.filter((o) => selected.has(o.id)).length;
    return count < g.min_select || (g.max_select != null && count > g.max_select);
  });

  async function checkout() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/firm-packages/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId, selectedOptionIds: [...selected] }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast.show(data.error ?? "Could not start checkout.", "error");
        setSubmitting(false);
        return;
      }
      if (data.configured === false) {
        toast.show(data.reason ?? "Payments aren't set up for this firm yet.", "error");
        setSubmitting(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      toast.show("Could not start checkout.", "error");
      setSubmitting(false);
    }
  }

  if (isLive) {
    const selectedIds = new Set(purchase!.selected_option_ids ?? []);
    return (
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium text-slate">{pkg.name}</p>
          <span
            className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
              purchase!.status === "active" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
            }`}
          >
            {STATUS_LABELS[purchase!.status] ?? purchase!.status}
          </span>
        </div>
        {purchase!.amount != null && (
          <p className="mt-1 text-sm text-muted">
            ${purchase!.amount} {cadenceLabel(purchase!.billing_cadence)}
          </p>
        )}
        {groups.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {groups.map((g) => {
              const picked = g.options.filter((o) => selectedIds.has(o.id));
              if (picked.length === 0) return null;
              return (
                <p key={g.id} className="text-sm text-slate">
                  <span className="text-muted">{g.name}: </span>
                  {picked.map((o) => o.label).join(", ")}
                </p>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <p className="font-medium text-slate">{pkg.name}</p>
      {pkg.description && <p className="mt-1 text-sm text-muted">{pkg.description}</p>}
      {pkg.flat_price != null && (
        <p className="mt-1 text-sm font-medium text-slate">
          ${pkg.flat_price} {cadenceLabel(pkg.billing_cadence)}
        </p>
      )}

      {groups.length > 0 && (
        <div className="mt-4 space-y-4">
          {groups.map((g) => (
            <div key={g.id}>
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                {g.name}
                {g.min_select > 0 && ` -- choose at least ${g.min_select}`}
                {g.max_select != null && ` (up to ${g.max_select})`}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {g.options.map((o) => {
                  const active = selected.has(o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => toggleOption(g, o.id)}
                      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm ${
                        active ? "border-accent bg-accent/10 text-accent" : "border-border text-slate hover:bg-surfaceMuted"
                      }`}
                    >
                      {active && <CheckCircle2 size={13} />} {o.label}
                    </button>
                  );
                })}
                {g.options.length === 0 && <span className="text-sm text-muted">No options set up yet.</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {purchase?.status === "canceled" && <p className="mt-3 text-xs text-muted">Your previous subscription was canceled -- check out again below.</p>}

      <Button type="button" className="mt-4" onClick={checkout} disabled={submitting || Boolean(invalidGroup)}>
        {submitting && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} Checkout
      </Button>
    </div>
  );
}
