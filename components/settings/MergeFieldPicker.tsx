"use client";

import { useState } from "react";
import { Tag } from "lucide-react";
import { MERGE_FIELD_GROUPS } from "@/lib/mergeFields";

// Click-to-insert, like Jotform's field tags -- staff pick a client/firm
// detail from this list instead of needing to know or type the {{token}}
// syntax by hand. Styled to stand out (filled, accent-toned) rather than a
// plain bordered button, since the whole point is that it gets noticed.
export function MergeFieldPicker({ onInsert, disabled, label = "Insert client detail" }: { onInsert: (token: string) => void; disabled?: boolean; label?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accentSoft px-3 py-1.5 text-xs font-medium text-accent hover:border-accent hover:bg-accentSoft/70 disabled:opacity-60"
      >
        <Tag size={12} aria-hidden="true" /> {label}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-72 max-h-80 overflow-y-auto rounded-2xl border border-border bg-surface shadow-soft p-2 shadow-lg">
            <p className="px-2 pb-1.5 text-[11px] text-muted">Click a detail to drop it in -- it&apos;ll fill in automatically when this goes out.</p>
            {MERGE_FIELD_GROUPS.map((g) => (
              <div key={g.group} className="mb-2">
                <p className="px-2 text-[10px] font-semibold uppercase tracking-wide text-muted">{g.group}</p>
                {g.fields.map((f) => (
                  <button
                    key={f.token}
                    type="button"
                    onClick={() => {
                      onInsert(`{{${f.token}}}`);
                      setOpen(false);
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs text-slate hover:bg-surfaceMuted"
                  >
                    <span>{f.label}</span>
                    <code className="text-[10px] text-muted">{`{{${f.token}}}`}</code>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
