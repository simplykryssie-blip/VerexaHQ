"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";

// For a subscription still at its 'incomplete' default -- checkout was
// never completed (Phase 4A). Reuses the exact same /api/signup/checkout
// route the original signup flow calls; that route already supports being
// called again for a non-active subscription, so this is a real retry of
// the original checkout, not a new flow.
export function ResumeCheckoutButton() {
  const toast = useToast();
  const [redirecting, setRedirecting] = useState(false);

  async function resumeCheckout() {
    setRedirecting(true);
    try {
      const res = await fetch("/api/signup/checkout", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setRedirecting(false);
        toast.show(data.error ?? "Could not start checkout.", "error");
        return;
      }
      window.location.href = data.url;
    } catch {
      setRedirecting(false);
      toast.show("Could not start checkout. Check your connection and try again.", "error");
    }
  }

  return (
    <button
      type="button"
      onClick={resumeCheckout}
      disabled={redirecting}
      className="mt-3 inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
    >
      {redirecting ? "Redirecting..." : "Complete Your Subscription"}
    </button>
  );
}
