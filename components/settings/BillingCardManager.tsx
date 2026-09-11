"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";
import { useToast } from "@/components/Toast";

const BRAND_LABEL: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  discover: "Discover",
};

export function BillingCardManager({
  cardBrand,
  cardLast4,
  cardExpMonth,
  cardExpYear,
}: {
  cardBrand: string | null;
  cardLast4: string | null;
  cardExpMonth: number | null;
  cardExpYear: number | null;
}) {
  const toast = useToast();
  const [redirecting, setRedirecting] = useState(false);

  async function addCard() {
    setRedirecting(true);
    const res = await fetch("/api/billing/add-card", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setRedirecting(false);
      toast.show(data.error ?? "Could not start card setup.", "error");
      return;
    }
    window.location.href = data.url;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm">
        <CreditCard size={16} className="text-muted" aria-hidden="true" />
        {cardLast4 ? (
          <span className="text-slate">
            {BRAND_LABEL[cardBrand ?? ""] ?? "Card"} ending in {cardLast4}
            {cardExpMonth && cardExpYear ? ` -- expires ${String(cardExpMonth).padStart(2, "0")}/${cardExpYear}` : ""}
          </span>
        ) : (
          <span className="text-muted">No card on file yet.</span>
        )}
      </div>
      <button
        type="button"
        onClick={addCard}
        disabled={redirecting}
        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent disabled:opacity-60"
      >
        {redirecting ? "Redirecting..." : cardLast4 ? "Update card" : "Add a card"}
      </button>
    </div>
  );
}
