"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/Button";

export type ProductPurchaseRow = {
  status: string;
  billing_cadence: string | null;
  amount: number | null;
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

// Client-direct checkout for a workspace's own digital_product/service
// catalog (see /api/products/checkout) -- the counterpart to
// PackageCheckoutCard, which sells a connected firm's package to that
// firm rather than a plain client. No option groups: digital_product/
// service creation (ProductsManager) doesn't expose them.
export function ProductCheckoutCard({
  clientId,
  product,
  purchase,
  canSell,
}: {
  clientId: string;
  product: { id: string; name: string; description: string | null; flat_price: number | null; billing_cadence: string | null };
  purchase: ProductPurchaseRow | null;
  canSell: boolean;
}) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);

  const isLive = purchase && ["pending", "active", "past_due"].includes(purchase.status);

  async function checkout() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/products/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, clientId }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast.show(data.error ?? "Could not start checkout.", "error");
        setSubmitting(false);
        return;
      }
      if (data.configured === false) {
        toast.show(data.reason ?? "Payments aren't set up for this workspace yet.", "error");
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
    return (
      <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium text-slate">{product.name}</p>
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
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <p className="font-medium text-slate">{product.name}</p>
      {product.description && <p className="mt-1 text-sm text-muted">{product.description}</p>}
      {product.flat_price != null && (
        <p className="mt-1 text-sm font-medium text-slate">
          ${product.flat_price} {cadenceLabel(product.billing_cadence)}
        </p>
      )}

      {purchase?.status === "canceled" && <p className="mt-3 text-xs text-muted">Previous purchase was canceled -- check out again below.</p>}

      {canSell && (
        <Button type="button" className="mt-4" onClick={checkout} disabled={submitting || !product.flat_price}>
          {submitting && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} Sell to this client
        </Button>
      )}
    </div>
  );
}
