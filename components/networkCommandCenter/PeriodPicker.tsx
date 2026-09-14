"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

// Calendar-period control for the Network Command Center's financial
// sections -- deliberately calendar-based, never tax-year, matching the
// Phase 5B Network Production definition. Leaving both fields empty tells
// the server to use its own "month to date" default (get_network_production
// et al.'s own convention) rather than this component recomputing that
// same default in JS and risking the two drifting apart.
export function PeriodPicker() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const isCustom = Boolean(from || to);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname);
    router.refresh();
  }

  function resetToMonthToDate() {
    router.replace(pathname);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={resetToMonthToDate}
        aria-pressed={!isCustom}
        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
          !isCustom ? "border-accent bg-accentSoft text-accent" : "border-border text-slate hover:border-accent hover:text-accent"
        }`}
      >
        Month to Date
      </button>
      <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5">
        <input
          type="date"
          aria-label="Period start"
          value={from}
          onChange={(e) => updateParam("from", e.target.value)}
          className="w-[120px] border-none bg-transparent text-xs text-slate focus:outline-none"
        />
        <span className="text-xs text-muted">to</span>
        <input
          type="date"
          aria-label="Period end"
          value={to}
          onChange={(e) => updateParam("to", e.target.value)}
          className="w-[120px] border-none bg-transparent text-xs text-slate focus:outline-none"
        />
      </div>
    </div>
  );
}
