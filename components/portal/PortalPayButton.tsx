"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";

// Reuses the same /api/stripe/checkout-session route the staff
// "Get payment link" button calls -- RLS already lets a portal user read
// their own invoice, so the route works unmodified. This just redirects
// the browser straight to Stripe instead of copying a link to clipboard.
export function PortalPayButton({ invoiceId }: { invoiceId: string }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  async function payNow() {
    setLoading(true);
    const res = await fetch("/api/stripe/checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceId }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      toast.show(data.error ?? "Could not start checkout.", "error");
      return;
    }
    if (!data.configured) {
      toast.show(data.reason ?? "Online payment isn't available yet -- contact your firm.", "info");
      return;
    }
    window.location.href = data.url;
  }

  return (
    <button
      type="button"
      onClick={payNow}
      disabled={loading}
      className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
    >
      {loading ? "Loading..." : "Pay now"}
    </button>
  );
}
