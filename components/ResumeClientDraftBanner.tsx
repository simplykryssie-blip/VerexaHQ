"use client";

import { RotateCcw, X } from "lucide-react";

export function ResumeClientDraftBanner({ onResume, onDiscard }: { onResume: () => void; onDiscard: () => void }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-ink">
      <span>You have an unsaved client entry from a possible duplicate check.</span>
      <div className="flex shrink-0 items-center gap-3">
        <button type="button" onClick={onResume} className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
          <RotateCcw size={12} /> Resume
        </button>
        <button type="button" onClick={onDiscard} className="inline-flex items-center gap-1 font-medium text-muted hover:text-ink">
          <X size={12} /> Discard
        </button>
      </div>
    </div>
  );
}
