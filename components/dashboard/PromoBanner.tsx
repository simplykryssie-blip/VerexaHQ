import Link from "next/link";
import { ArrowRight } from "lucide-react";

// A self-promotional slot on the dashboard -- content here is swappable per
// workspace (e.g. cross-promoting a related service or sister product), not
// wired to any data. Edit the props below directly, or lift them into a
// prop/config later if this needs to vary per workspace.
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
  return (
    <div className="relative mb-4 overflow-hidden rounded-2xl bg-accent px-8 py-7 shadow-soft">
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
