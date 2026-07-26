"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { ALL_STATE_OPTIONS, stateLabel } from "@/lib/intakeStates";

// Searchable multi-select for "states lived or worked in". Stores
// normalized codes (e.g. "GA", "FOREIGN", "NONE"); the caller sees full
// names via stateLabel(). "None" and any real state are mutually
// exclusive -- picking one clears the other, since "none, just my home
// state" isn't meaningful alongside an actual state selection here (the
// taxpayer's home state, if relevant, is asked about separately).
export function StatesMultiSelect({ value, onChange }: { value: string[]; onChange: (codes: string[]) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = ALL_STATE_OPTIONS.filter((o) => !value.includes(o.code));
    if (!q) return pool.slice(0, 8);
    return pool.filter((o) => o.label.toLowerCase().includes(q) || o.code.toLowerCase() === q).slice(0, 8);
  }, [query, value]);

  function add(code: string) {
    if (code === "NONE") {
      onChange(["NONE"]);
    } else {
      onChange([...value.filter((c) => c !== "NONE"), code]);
    }
    setQuery("");
    setOpen(false);
  }
  function remove(code: string) {
    onChange(value.filter((c) => c !== code));
  }

  return (
    <div className="min-w-0">
      <label className="block text-xs font-semibold text-muted mb-1">State(s) you lived or worked in this year</label>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map((code) => (
            <span
              key={code}
              className="inline-flex items-center gap-1 text-xs font-medium bg-paperDim border border-line rounded-full pl-2.5 pr-1.5 py-1"
            >
              {stateLabel(code)}
              <button type="button" onClick={() => remove(code)} aria-label={`Remove ${stateLabel(code)}`}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          placeholder="Search states, territories, or Foreign country…"
          className="w-full min-w-0 border border-line rounded-sm px-3 py-2 text-sm"
        />
        {open && results.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-line rounded-sm shadow-lg max-h-56 overflow-y-auto">
            {results.map((o) => (
              <button
                key={o.code}
                type="button"
                onClick={() => add(o.code)}
                className="w-full text-left text-sm px-3 py-2 hover:bg-paperDim"
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
        {open && (
          <button
            type="button"
            className="fixed inset-0 z-0 cursor-default"
            aria-hidden
            onClick={() => setOpen(false)}
            tabIndex={-1}
          />
        )}
      </div>
    </div>
  );
}
