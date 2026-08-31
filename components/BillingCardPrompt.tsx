"use client";

import { useEffect, useState } from "react";
import { CreditCard, X } from "lucide-react";
import { useToast } from "@/components/Toast";

const DISMISS_KEY = "billing-card-prompt-dismissed";

export function BillingCardPrompt({
  needed,
  urgent,
  daysUntilPeriodEnd,
  periodEnd,
}: {
  needed: boolean;
  urgent: boolean;
  daysUntilPeriodEnd: number | null;
  periodEnd: string | null;
}) {
  const toast = useToast();
  const [dismissed, setDismissed] = useState(true);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!needed) return;
    setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
  }, [needed]);

  if (!needed || dismissed) return null;

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

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

  const cutoffDate = periodEnd
    ? new Date(periodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/Chicago" })
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <CreditCard size={18} className={urgent ? "text-danger" : "text-accent"} aria-hidden="true" />
            <h2 className="font-display text-base font-semibold text-ink">Add a payment method</h2>
          </div>
          <button type="button" onClick={dismiss} aria-label="Dismiss" className="text-muted hover:text-ink">
            <X size={16} />
          </button>
        </div>

        <p className="mt-3 text-sm text-slate">
          {urgent ? (
            <>
              There&apos;s no card on file for your Verexa subscription, and your billing cycle
              {cutoffDate ? ` renews ${cutoffDate}` : " is renewing soon"}. Add a card now to avoid your account being suspended
              {cutoffDate ? ` by midnight CST on ${cutoffDate}` : ""} if payment can&apos;t be collected.
            </>
          ) : (
            <>
              There&apos;s no payment method on file for your Verexa subscription
              {daysUntilPeriodEnd !== null ? ` (renews in ${daysUntilPeriodEnd} day${daysUntilPeriodEnd === 1 ? "" : "s"})` : ""}. Add one now so
              there&apos;s no interruption to your account.
            </>
          )}
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={dismiss} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-slate hover:border-accent hover:text-accent">
            Remind me later
          </button>
          <button
            type="button"
            onClick={addCard}
            disabled={redirecting}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
          >
            {redirecting ? "Redirecting..." : "Add a card"}
          </button>
        </div>
      </div>
    </div>
  );
}
