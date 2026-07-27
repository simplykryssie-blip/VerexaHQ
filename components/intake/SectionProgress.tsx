"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

// Mobile-first progress indicator. Replaces the old row of 8 tab buttons
// (which overflowed/crowded small screens) with a single "Step X of 8" +
// name + progress bar, and a compact expandable list for jumping directly
// to another section without needing eight buttons visible at once.
export function SectionProgress({
  sections,
  current,
  onJump,
}: {
  sections: readonly string[];
  current: number;
  onJump: (n: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const pct = Math.round((current / sections.length) * 100);

  return (
    <div className="bg-white border border-line rounded-sm p-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-2 min-w-0"
      >
        <div className="min-w-0 text-left">
          <div className="text-xs font-semibold text-muted">
            Step {current} of {sections.length}
          </div>
          <div className="text-sm font-bold text-ink truncate">{sections[current - 1]}</div>
        </div>
        {expanded ? <ChevronUp size={18} className="shrink-0 text-muted" /> : <ChevronDown size={18} className="shrink-0 text-muted" />}
      </button>
      <div className="mt-2 h-1.5 w-full bg-paperDim rounded-full overflow-hidden">
        <div className="h-full bg-green rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      {expanded && (
        <div className="mt-3 space-y-1">
          {sections.map((label, i) => {
            const n = i + 1;
            const active = n === current;
            return (
              <button
                key={label}
                type="button"
                onClick={() => {
                  onJump(n);
                  setExpanded(false);
                }}
                className="w-full flex items-center gap-2 text-left text-sm px-2 py-1.5 rounded-sm min-w-0"
                style={{ backgroundColor: active ? "#EAF4F0" : "transparent" }}
              >
                <span
                  className="shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center"
                  style={{ backgroundColor: active ? "#172622" : "#DDEAE5", color: active ? "white" : "#60716B" }}
                >
                  {n}
                </span>
                <span className="truncate text-ink">{label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
