"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

// Purpose-built for Reports > Network, where Partner Production and
// Payouts each need their OWN independent calendar-period control on the
// same page -- a shared "from"/"to" pair (like components/networkCommandCenter/
// PeriodPicker.tsx or FilterBar) would collide between the two sections.
// Left completely separate from those rather than generalizing either one,
// so neither Phase 5C/5D's command centers nor other Reports pages take on
// any risk from this change. Leaving both fields empty tells the server to
// fall back to its own "month to date" default, same convention as
// PeriodPicker -- this component never recomputes that default in JS.
export function NetworkPeriodFilter({
  fromParam,
  toParam,
  statusParam,
}: {
  fromParam: string;
  toParam: string;
  /** When provided, also renders a Pending/Paid/All status select using this query param name. */
  statusParam?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const from = searchParams.get(fromParam) ?? "";
  const to = searchParams.get(toParam) ?? "";
  const status = statusParam ? (searchParams.get(statusParam) ?? "") : "";
  const isCustomPeriod = Boolean(from || to);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname);
    router.refresh();
  }

  function resetToMonthToDate() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete(fromParam);
    params.delete(toParam);
    router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={resetToMonthToDate}
        aria-pressed={!isCustomPeriod}
        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
          !isCustomPeriod ? "border-accent bg-accentSoft text-accent" : "border-border text-slate hover:border-accent hover:text-accent"
        }`}
      >
        Month to Date
      </button>
      <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5">
        <input
          type="date"
          aria-label="Period start"
          value={from}
          onChange={(e) => updateParam(fromParam, e.target.value)}
          className="w-[120px] border-none bg-transparent text-xs text-slate focus:outline-none"
        />
        <span className="text-xs text-muted">to</span>
        <input
          type="date"
          aria-label="Period end"
          value={to}
          onChange={(e) => updateParam(toParam, e.target.value)}
          className="w-[120px] border-none bg-transparent text-xs text-slate focus:outline-none"
        />
      </div>
      {statusParam && (
        <select
          aria-label="Payout status"
          value={status}
          onChange={(e) => updateParam(statusParam, e.target.value)}
          className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-slate focus:border-accent focus:outline-none"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
        </select>
      )}
    </div>
  );
}
