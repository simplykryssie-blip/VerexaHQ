"use client";

import { useState } from "react";
import { MERGE_FIELD_GROUPS } from "@/lib/engagementLetters/mergeFields";

export function MergeFieldPicker({ onInsert, disabled }: { onInsert: (token: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent disabled:opacity-60"
      >
        + Insert merge field
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-72 max-h-80 overflow-y-auto rounded-xl border border-border bg-surface p-2 shadow-lg">
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
