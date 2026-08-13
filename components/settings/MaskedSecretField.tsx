"use client";

import { useState } from "react";

// Mirrors clients/[id]/TaxIdReveal.tsx's reveal/hide UX -- the masked value
// (last 4 only) is all that's ever sent to the browser on page load; the
// real value is fetched on demand via a permission-gated, audit-logged RPC
// the caller supplies.
export function MaskedSecretField({
  label,
  last4,
  onReveal,
  newValue,
  onNewValueChange,
  clear,
  onClearChange,
  helpText,
}: {
  label: string;
  last4: string | null;
  onReveal: () => PromiseLike<{ data: string | null; error: { message: string } | null }>;
  newValue: string;
  onNewValueChange: (v: string) => void;
  clear: boolean;
  onClearChange: (v: boolean) => void;
  helpText?: string;
}) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);

  async function reveal() {
    setRevealing(true);
    setRevealError(null);
    const { data, error } = await onReveal();
    setRevealing(false);
    if (error) {
      setRevealError(error.message);
      return;
    }
    setRevealed(data);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-slate">{label}</label>
        {last4 && !clear && (
          <span className="inline-flex items-center gap-2 text-xs">
            <span className="font-mono text-muted">{revealed ?? `••••${last4}`}</span>
            <button
              type="button"
              disabled={revealing}
              onClick={() => (revealed ? setRevealed(null) : reveal())}
              className="font-medium text-accent hover:underline disabled:opacity-60"
            >
              {revealing ? "Revealing..." : revealed ? "Hide" : "Reveal"}
            </button>
          </span>
        )}
      </div>
      {helpText && <p className="mt-0.5 text-xs text-muted">{helpText}</p>}
      {revealError && <p className="mt-0.5 text-xs text-danger">{revealError}</p>}
      <input
        value={newValue}
        onChange={(e) => onNewValueChange(e.target.value)}
        disabled={clear}
        placeholder={last4 ? `Currently ending in ${last4} -- enter a new value to replace it` : "Not set"}
        className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-surfaceMuted disabled:opacity-60"
      />
      {last4 && (
        <label className="mt-1 flex items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            checked={clear}
            onChange={(e) => {
              onClearChange(e.target.checked);
              if (e.target.checked) onNewValueChange("");
            }}
            className="h-3.5 w-3.5 rounded border-border"
          />
          Remove this value
        </label>
      )}
    </div>
  );
}
