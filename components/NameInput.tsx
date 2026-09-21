"use client";

import { parseNameValue, stringifyNameValue } from "@/lib/organizer/formatValue";

/** Structured first/middle/last/suffix entry, stored as one JSON string --
 *  mirrors AddressInput.tsx's shape so both compound field types behave the
 *  same way everywhere they're used. */
export function NameInput({
  value,
  onChange,
  disabled,
  inputClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  inputClassName?: string;
}) {
  const parts = parseNameValue(value);
  const inputClass =
    "w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-surfaceMuted" +
    (inputClassName ? ` ${inputClassName}` : "");

  function set(patch: Partial<typeof parts>) {
    onChange(stringifyNameValue({ ...parts, ...patch }));
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <input
        disabled={disabled}
        value={parts.first}
        onChange={(e) => set({ first: e.target.value })}
        placeholder="First name"
        className={`${inputClass} col-span-2 sm:col-span-1`}
      />
      <input disabled={disabled} value={parts.middle} onChange={(e) => set({ middle: e.target.value })} placeholder="Middle" className={inputClass} />
      <input
        disabled={disabled}
        value={parts.last}
        onChange={(e) => set({ last: e.target.value })}
        placeholder="Last name"
        className={`${inputClass} col-span-2 sm:col-span-1`}
      />
      <input disabled={disabled} value={parts.suffix} onChange={(e) => set({ suffix: e.target.value })} placeholder="Suffix (Jr., Sr., III)" className={inputClass} />
    </div>
  );
}
