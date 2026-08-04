"use client";

import { useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export type ReportColumn<T> = {
  key: string;
  label: string;
  align?: "left" | "right";
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
};

export function SortableTable<T extends { id: string }>({
  columns,
  rows,
  emptyMessage = "No data for this filter.",
}: {
  columns: ReportColumn<T>[];
  rows: T[];
  emptyMessage?: string;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);

  const sorted = (() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column?.sortValue) return rows;
    return [...rows].sort((a, b) => {
      const av = column.sortValue!(a);
      const bv = column.sortValue!(b);
      if (av < bv) return -1 * sort.dir;
      if (av > bv) return 1 * sort.dir;
      return 0;
    });
  })();

  if (rows.length === 0) return <EmptyState message={emptyMessage} />;

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full text-sm">
        <caption className="sr-only">Report results, {rows.length} rows</caption>
        <thead>
          <tr className="border-b border-border bg-surfaceMuted text-xs uppercase tracking-wide text-muted">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={`px-4 py-2 font-medium ${c.align === "right" ? "text-right" : "text-left"}`}>
                {c.sortValue ? (
                  <button
                    type="button"
                    onClick={() => setSort((prev) => ({ key: c.key, dir: prev?.key === c.key ? (prev.dir === 1 ? -1 : 1) : 1 }))}
                    className="inline-flex items-center gap-1 hover:text-ink"
                  >
                    {c.label} <ArrowUpDown size={12} aria-hidden="true" />
                  </button>
                ) : (
                  c.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map((row) => (
            <tr key={row.id} className="hover:bg-surfaceMuted">
              {columns.map((c) => (
                <td key={c.key} className={`px-4 py-2 text-slate ${c.align === "right" ? "text-right" : "text-left"}`}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
