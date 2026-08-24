"use client";

import { useId } from "react";

// A plain text input that also offers the workspace's existing tags via the
// browser's native datalist autocomplete -- pick an existing tag, or just
// type a new one. Nothing is created here; the actual "create it if it
// doesn't exist yet" check still happens at save time via ensureTagConfirmed
// (lib/ensureTag.ts), same as before this input existed.
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
  const listId = useId();
  return (
    <>
      <input
        list={listId}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={
          className ??
          "rounded-lg border border-border px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
        }
      />
      <datalist id={listId}>
        {tagOptions.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </>
  );
}
