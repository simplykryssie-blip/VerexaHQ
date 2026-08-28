"use client";

import { parseAddressValue, stringifyAddressValue } from "@/lib/organizer/formatValue";
import { US_STATES } from "@/lib/usStates";

/** Structured street/city/state/zip entry, stored as one JSON string -- shared between
 *  the organizer builder's address fields and any other address entry in the app. */
export function AddressInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const parts = parseAddressValue(value);
  const inputClass =
    "w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-surfaceMuted";

  function set(patch: Partial<typeof parts>) {
    onChange(stringifyAddressValue({ ...parts, ...patch }));
  }

  return (
    <div className="space-y-2">
      <input disabled={disabled} value={parts.street} onChange={(e) => set({ street: e.target.value })} placeholder="Street address" className={inputClass} />
      <input
        disabled={disabled}
        value={parts.street2}
        onChange={(e) => set({ street2: e.target.value })}
        placeholder="Street address line 2"
        className={inputClass}
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input
          disabled={disabled}
          value={parts.city}
          onChange={(e) => set({ city: e.target.value })}
          placeholder="City"
          className={`${inputClass} sm:col-span-2`}
        />
        <select disabled={disabled} value={parts.state} onChange={(e) => set({ state: e.target.value })} className={inputClass}>
          <option value="">State</option>
          {US_STATES.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
        <input disabled={disabled} value={parts.zip} onChange={(e) => set({ zip: e.target.value })} placeholder="Zip code" className={inputClass} />
      </div>
    </div>
  );
}
