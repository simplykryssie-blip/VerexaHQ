"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";

// The only functional next step for a suspended workspace with no working
// checkout in progress -- SuspendedWorkspaceScreen's "Resolve Billing" link
// and this page's own banner both only ever navigated here; nothing on this
// page previously called /api/signup/checkout again, so a suspended
// workspace had no way to actually complete or retry its subscription.
export function ResumeCheckoutButton() {
  const toast = useToast();
  const [redirecting, setRedirecting] = useState(false);

  async function resume() {
    setRedirecting(true);
    try {
      const res = await fetch("/api/signup/checkout", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setRedirecting(false);
        toast.show(data.error ?? "Could not start checkout.", "error");
        return;
      }
      window.location.href = data.url;
    } catch {
      setRedirecting(false);
      toast.show("Could not start checkout.", "error");
    }
  }

  return (
    <button
      type="button"
      onClick={resume}
      disabled={redirecting}
      className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
    >
      {redirecting ? "Redirecting..." : "Resume checkout"}
    </button>
  );
}
