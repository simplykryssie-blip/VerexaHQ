"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";

export function RefundButton({ paymentId, amount }: { paymentId: string; amount: number }) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  async function refund() {
    if (!window.confirm(`Refund $${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}? This cannot be undone.`)) {
      return;
    }
    setLoading(true);
    const res = await fetch("/api/stripe/refund", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      toast.show(data.error ?? "Could not refund this payment.", "error");
      return;
    }
    if (!data.configured) {
      toast.show(data.reason ?? "Stripe is not configured for this workspace.", "error");
      return;
    }
    toast.show("Payment refunded.", "success");
    router.refresh();
  }

  return (
    <button type="button" disabled={loading} onClick={refund} className="text-xs font-medium text-danger hover:underline disabled:opacity-60">
      {loading ? "Refunding..." : "Refund"}
    </button>
  );
}
