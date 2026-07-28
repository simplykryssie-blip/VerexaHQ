"use client";

import { useEffect, useState } from "react";

// Shared clearable date input for optional-date fields across the app's
// internal forms (Client-First / Product Polish standard: "Users should
// always be able to edit or remove a selected date"). Native browser date
// pickers don't reliably expose a clear affordance, so this always renders
// one once a value is set.
type Props = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  className?: string;
};

export default function DateField({ value, onChange, onBlur, className }: Props) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  return (
    <div>
      <input
        type="date"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(e.target.value);
        }}
        onBlur={onBlur}
        className={className ?? "w-full border border-line rounded-sm px-3 py-2 text-sm"}
      />
      {draft && (
        <button
          type="button"
          onClick={() => {
            setDraft("");
            onChange("");
          }}
          className="text-[11px] font-semibold text-muted underline mt-1"
        >
          Clear date
        </button>
      )}
    </div>
  );
}
