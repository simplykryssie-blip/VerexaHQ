"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";

// A self-promotional slot on the dashboard -- content here is swappable per
// workspace (e.g. cross-promoting a related service or sister product), not
// wired to any data. Edit the props below directly, or lift them into a
// prop/config later if this needs to vary per workspace.
//
// Dismiss is local-to-page-load only (component state, not persisted) --
// same reasoning as OnboardingChecklist's closedForNow: there's no per-user
// "seen this" record for a rotating promo slot, so it just comes back on the
// next visit rather than needing a dismiss table for placeholder content.
export function PromoBanner({
  eyebrow = "Focus on what matters.",
  headline = "We'll handle the rest.",
  description = "Automate the busywork, keep clients in the loop, and grow your practice with Verexa.",
  ctaLabel = "See how it works",
  ctaHref = "/workflows",
}: {
  eyebrow?: string;
  headline?: string;
  description?: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="relative mb-4 overflow-hidden rounded-2xl bg-accent px-8 py-7 shadow-soft">
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="absolute right-3 top-3 z-10 rounded-full p-1 text-white/70 transition hover:bg-white/10 hover:text-white"
      >
        <X size={16} aria-hidden="true" />
      </button>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 text-white/10"
        viewBox="0 0 200 200"
        fill="none"
      >
        <circle cx="100" cy="100" r="100" fill="currentColor" />
      </svg>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-16 right-24 h-40 w-40 text-white/10"
        viewBox="0 0 200 200"
        fill="none"
      >
        <circle cx="100" cy="100" r="100" fill="currentColor" />
      </svg>
      <div className="relative flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xl">
          <p className="font-display text-xl font-semibold leading-snug text-white sm:text-2xl">
            {eyebrow}
            <br />
            {headline}
          </p>
          <p className="mt-2 text-sm text-white/85">{description}</p>
        </div>
        <Link
          href={ctaHref}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-accent transition hover:bg-white/90"
        >
          {ctaLabel} <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
