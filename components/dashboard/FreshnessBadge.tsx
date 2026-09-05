"use client";

import { useEffect, useState } from "react";

/**
 * The dashboard page is force-dynamic -- every load re-runs every widget's
 * query against the live database, so there's no cache layer whose staleness
 * needs explaining. This just makes that real-time-ness visible instead of
 * assumed, and doubles as an honest signal if that ever changes (a future
 * cached widget would need its own freshness stamp, not this one).
 * generatedAt is computed server-side (this render's timestamp) and
 * formatted here, client-side, so the displayed time is in the viewer's own
 * timezone rather than the server's -- computing it directly during SSR
 * would risk a hydration mismatch against that same client-local format.
 */
export function FreshnessBadge({ generatedAt }: { generatedAt: string }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    setLabel(new Date(generatedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }));
  }, [generatedAt]);

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-muted"
      title="Every metric on this page is queried live -- nothing here is cached."
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
      </span>
      Live{label ? ` · updated ${label}` : ""}
    </span>
  );
}
