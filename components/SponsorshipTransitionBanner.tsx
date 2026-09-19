"use client";

import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

const DISMISS_KEY = "sponsorship-transition-banner-dismissed";

export type SponsorshipTransition = {
  sponsorWorkspaceName: string;
  sponsorshipEndDate: string;
  planName: string;
  basePriceCents: number;
};

export function SponsorshipTransitionBanner({ transition }: { transition: SponsorshipTransition | null }) {
  const toast = useToast();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [settingUp, setSettingUp] = useState(false);

  if (!transition || dismissed) return null;
  const { sponsorWorkspaceName, sponsorshipEndDate, planName, basePriceCents } = transition;

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // sessionStorage unavailable (private browsing, etc.) -- fine to skip
    }
    setDismissed(true);
  }

  async function setUpBilling() {
    setSettingUp(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("start_personal_billing_setup").single();
      if (error || !data?.workspace_id) {
        toast.show(error?.message ?? "Could not start billing setup.", "error");
        setSettingUp(false);
        return;
      }

      const switchRes = await fetch("/api/workspace/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: data.workspace_id }),
      });
      if (!switchRes.ok) {
        const switchBody = await switchRes.json().catch(() => ({}));
        toast.show(switchBody.error ?? "Could not switch to your personal workspace.", "error");
        setSettingUp(false);
        return;
      }

      // start_personal_billing_setup already created this workspace's own
      // workspace_subscriptions row (plan set, stripe_status defaulted to
      // "incomplete") -- it's an existing workspace that needs its first
      // real Stripe subscription attached, not a brand-new payment-first
      // signup with no workspace yet. /api/signup/checkout requires a
      // pending_signup_id, which doesn't exist (and shouldn't be invented)
      // for this case; /api/billing/resume-checkout is the existing route
      // built for exactly this shape (an already-provisioned workspace
      // whose workspace_subscriptions row has no active Stripe subscription
      // yet), and needs no request body -- it resolves the workspace from
      // the cookie the switch above just set.
      const checkoutRes = await fetch("/api/billing/resume-checkout", { method: "POST" });
      const checkoutBody = await checkoutRes.json().catch(() => ({}));
      if (!checkoutRes.ok || !checkoutBody.url) {
        toast.show(checkoutBody.error ?? "Could not start checkout.", "error");
        setSettingUp(false);
        return;
      }

      window.location.href = checkoutBody.url;
    } catch {
      toast.show("Could not start billing setup. Try again.", "error");
      setSettingUp(false);
    }
  }

  const endDate = new Date(sponsorshipEndDate).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Chicago",
  });
  const monthlyPrice = (basePriceCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

  return (
    <div className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm text-ink">
      <span className="flex items-center gap-2">
        <AlertTriangle size={14} className="shrink-0 text-warning" aria-hidden="true" />
        {sponsorWorkspaceName} has released you. You keep full access through {endDate}. After that, you&apos;ll need your own billing
        ({planName} plan, {monthlyPrice}/month + applicable sales tax) to keep using your account.
      </span>
      <div className="flex shrink-0 items-center gap-4">
        <button
          type="button"
          onClick={setUpBilling}
          disabled={settingUp}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
        >
          {settingUp ? "Redirecting..." : "Set Up My Billing"}
        </button>
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="text-muted hover:text-ink">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
