"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { DropdownPanel, useDropdownDismiss } from "@/components/ui/Dropdown";

// A combobox over the workspace's existing tags -- click the field to see
// every current tag in a real, clickable dropdown (not a browser datalist,
// which only suggests once you start typing and looks like a plain text
// box until then), or keep typing to filter the list down and add a brand
// new tag. Nothing is created here; the actual "create it if it doesn't
// exist yet" check still happens at save time via ensureTagConfirmed
// (lib/ensureTag.ts), same as before this component existed -- picking an
// existing tag from the list never prompts, only typing a name with no
// match does, and only once Save runs.
export function TagNameInput({
  value,
  onChange,
  tagOptions,
  disabled,
  placeholder = "e.g. vip",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  tagOptions: string[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useDropdownDismiss<HTMLDivElement>(open, () => setOpen(false));
  const listId = useId();

  const q = value.trim().toLowerCase();
  const filtered = q ? tagOptions.filter((t) => t.toLowerCase().includes(q)) : tagOptions;
  const hasExactMatch = tagOptions.some((t) => t.toLowerCase() === q);
  const inputClass =
    className ??
    "rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60";

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          id={listId}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
          className={`${inputClass} w-full pr-7`}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          tabIndex={-1}
          aria-label="Show existing tags"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink disabled:opacity-60"
        >
          <ChevronDown size={14} />
        </button>
      </div>
      {open && !disabled && (
        <DropdownPanel className="mt-1 max-h-48 w-full min-w-[10rem] overflow-y-auto p-1">
          {filtered.length === 0 && !q && <p className="px-2.5 py-2 text-xs text-muted">No tags yet.</p>}
          {filtered.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                onChange(t);
                setOpen(false);
              }}
              className={`block w-full truncate rounded-md px-2.5 py-1.5 text-left text-sm ${
                t === value ? "bg-accentSoft text-accent" : "text-ink hover:bg-surfaceMuted"
              }`}
            >
              {t}
            </button>
          ))}
          {q && !hasExactMatch && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="block w-full truncate rounded-md px-2.5 py-1.5 text-left text-sm font-medium text-accent hover:bg-accentSoft"
            >
              + Add &quot;{value.trim()}&quot;
            </button>
          )}
        </DropdownPanel>
      )}
    </div>
  );
}
