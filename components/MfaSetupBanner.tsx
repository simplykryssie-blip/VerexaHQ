"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldAlert, X } from "lucide-react";

const DISMISS_KEY = "mfa-setup-banner-dismissed";

// Persistent-but-non-blocking: reappears every new session (sessionStorage,
// not localStorage -- same pattern as SponsorshipTransitionBanner) until a
// verified factor exists, but never blocks normal CRM use the way
// SuspendedWorkspaceScreen or AcceptTermsGate do. hasVerifiedMfaFactor is
// computed server-side in app/(app)/layout.tsx (supabase.auth.mfa.listFactors()
// reads the session the same way either side), so this component itself
// never calls Supabase -- it just renders or doesn't.
export function MfaSetupBanner({ hasVerifiedMfaFactor }: { hasVerifiedMfaFactor: boolean }) {
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  // Never show on the page that fixes it -- MfaSetup.tsx on that page
  // already covers the same ground, and a banner telling you to go where
  // you already are is noise.
  if (hasVerifiedMfaFactor || dismissed || pathname?.startsWith("/settings/security")) return null;

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // sessionStorage unavailable (private browsing, etc.) -- fine to skip
    }
    setDismissed(true);
  }

  return (
    <div className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b border-accent/30 bg-accentSoft px-4 py-2 text-sm text-ink">
      <span className="flex items-center gap-2">
        <ShieldAlert size={14} className="shrink-0 text-accent" aria-hidden="true" />
        Set up two-factor authentication to secure your account. It&apos;s required for sensitive actions like connecting Stripe, managing
        sending domains, and issuing refunds.
      </span>
      <div className="flex shrink-0 items-center gap-4">
        <Link
          href="/settings/security"
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90"
        >
          Set Up Two-Factor Authentication
        </Link>
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="text-muted hover:text-ink">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
