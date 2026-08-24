"use client";

import { useRouter } from "next/navigation";
import { DASHBOARD_RANGES, type DashboardRange } from "@/lib/dashboard/range";

export function RangeSwitcher({ range }: { range: DashboardRange }) {
  const router = useRouter();
  return (
    <div role="group" aria-label="Date range" className="flex items-center rounded-lg border border-border p-0.5">
      {DASHBOARD_RANGES.map((r) => (
        <button
          key={r.value}
          type="button"
          aria-pressed={range === r.value}
          onClick={() => {
            if (r.value === range) return;
            const params = new URLSearchParams(window.location.search);
            params.set("range", r.value);
            router.push(`?${params.toString()}`);
          }}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
            range === r.value ? "bg-accent text-white" : "text-slate hover:bg-surfaceMuted"
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
