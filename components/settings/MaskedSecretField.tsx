"use client";

import { useState } from "react";

// Mirrors clients/[id]/TaxIdReveal.tsx's reveal/hide UX -- the masked value
// (last 4 only) is all that's ever sent to the browser on page load; the
// real value is fetched on demand via a permission-gated, audit-logged RPC
// the caller supplies.
//
// Renders as one label-left row rather than a self-contained card -- the
// caller is expected to wrap a group of these in a bordered, divide-y panel
// so several identifiers read as one record instead of stacked mini-forms.
export function MaskedSecretField({
  label,
  helpText,
  last4,
  onReveal,
  newValue,
  onNewValueChange,
  clear,
  onClearChange,
}: {
  label: string;
  helpText?: string;
  last4: string | null;
  onReveal: () => PromiseLike<{ data: string | null; error: { message: string } | null }>;
  newValue: string;
  onNewValueChange: (v: string) => void;
  clear: boolean;
  onClearChange: (v: boolean) => void;
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
    <div className="grid grid-cols-[minmax(0,140px)_1fr_auto] items-center gap-4 px-5 py-3">
      <div>
        <span className="text-xs font-semibold text-slate">{label}</span>
        {helpText && <span className="mt-0.5 block text-[11px] leading-snug text-muted">{helpText}</span>}
      </div>

      <div className="flex min-w-0 items-center gap-2.5">
        {last4 && !clear && (
          <span className="whitespace-nowrap rounded border border-border bg-surfaceMuted px-2 py-1.5 font-mono text-xs text-ink">
            {revealed ?? `••••${last4}`}
          </span>
        )}
        <input
          value={newValue}
          onChange={(e) => onNewValueChange(e.target.value)}
          disabled={clear}
          placeholder={last4 ? "Enter a new value to replace it" : "Not set"}
          className="min-w-0 flex-1 rounded border border-border px-2.5 py-1.5 font-mono text-xs text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-surfaceMuted disabled:opacity-60"
        />
      </div>

      <div className="flex items-center gap-3.5 whitespace-nowrap text-xs">
        {last4 && !clear && (
          <button
            type="button"
            disabled={revealing}
            onClick={() => (revealed ? setRevealed(null) : reveal())}
            className="font-semibold text-accent hover:underline disabled:opacity-60"
          >
            {revealing ? "Revealing..." : revealed ? "Hide" : "Reveal"}
          </button>
        )}
        {last4 && (
          <label className="flex items-center gap-1.5 text-muted">
            <input
              type="checkbox"
              checked={clear}
              onChange={(e) => {
                onClearChange(e.target.checked);
                if (e.target.checked) onNewValueChange("");
              }}
              className="h-3.5 w-3.5 rounded border-border"
            />
            Remove
          </label>
        )}
      </div>

      {revealError && <p className="col-span-full -mt-1 text-xs text-danger">{revealError}</p>}
    </div>
  );
}
