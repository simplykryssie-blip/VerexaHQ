"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const MATCH_LABELS: Record<string, string> = {
  email: "email",
  phone: "phone",
  ssn: "SSN",
  ein: "EIN",
};

function formatMatchedOn(matchedOn: string[]) {
  const labels = matchedOn.map((m) => MATCH_LABELS[m] ?? m);
  if (labels.length === 0) return "information";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

// Shown when create_client() returns is_new: false. Blocking by design --
// the caller must not proceed with any further writes (address, contact,
// engagement, etc.) against the matched existing client until the user
// explicitly confirms it's not actually a duplicate -- either by opening
// the existing client, or by choosing "create anyway" for a legitimate
// shared email/phone (spouses, business partners), which re-submits with
// the server-side dedupe check skipped for this one client.
export function DuplicateClientModal({
  matchedOn,
  existingClientId,
  onCancel,
  onViewExisting,
  onCreateAnyway,
}: {
  matchedOn: string[];
  existingClientId: string;
  onCancel: () => void;
  onViewExisting: () => void;
  onCreateAnyway: () => void;
}) {
  const supabase = createClient();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("clients")
      .select("client_type, first_name, last_name, business_name")
      .eq("id", existingClientId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setName(
          data.client_type === "business" && data.business_name
            ? data.business_name
            : [data.first_name, data.last_name].filter(Boolean).join(" ") || null
        );
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingClientId]);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-8">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-softHover">
        <h3 className="font-display text-sm font-semibold text-ink">Possible duplicate client</h3>
        <p className="mt-2 text-sm text-slate">
          A client matching this {formatMatchedOn(matchedOn)} already exists{name ? `: ${name}` : "."}
          {name ? "." : ""}
        </p>
        <p className="mt-2 text-xs text-muted">
          Nothing has been added to that client. Your typed entry is still here if this turns out to be a different person or business.
        </p>
        <p className="mt-2 text-xs text-muted">
          If this is genuinely a different person who just shares that {formatMatchedOn(matchedOn)} -- a spouse or business partner, for
          example -- you can create them as a separate client anyway.
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate hover:bg-surfaceMuted">
            Cancel
          </button>
          <button
            type="button"
            onClick={onCreateAnyway}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-slate hover:bg-surfaceMuted"
          >
            Create as new client anyway
          </button>
          <button
            type="button"
            onClick={onViewExisting}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90"
          >
            View existing client
          </button>
        </div>
      </div>
    </div>
  );
}
