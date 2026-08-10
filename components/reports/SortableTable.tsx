"use client";

import { useEffect, useState } from "react";
import { ArrowUpDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

// Plain metadata only -- no functions. Server Components that build a table
// compute each cell's content themselves (see lib/reports/buildReportTable.ts)
// and pass the result here, because a function value in a prop passed from a
// Server Component to this Client Component fails at the RSC boundary
// ("Functions cannot be passed directly to Client Components").
export type ReportColumn = {
  key: string;
  label: string;
  align?: "left" | "right";
  sortable?: boolean;
};

export type ReportRow = {
  id: string;
  cells: Record<string, React.ReactNode>;
  sortValues?: Record<string, string | number>;
};

export function SortableTable({
  columns,
  rows,
  emptyMessage = "No data for this filter.",
  pageSize = 25,
}: {
  columns: ReportColumn[];
  rows: ReportRow[];
  emptyMessage?: string;
  pageSize?: number;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);

  const sorted = (() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column?.sortable) return rows;
    return [...rows].sort((a, b) => {
      const av = a.sortValues?.[sort.key] ?? "";
      const bv = b.sortValues?.[sort.key] ?? "";
      if (av < bv) return -1 * sort.dir;
      if (av > bv) return 1 * sort.dir;
      return 0;
    });
  })();

  const pageCount = Math.max(Math.ceil(sorted.length / pageSize), 1);
  const clampedPage = Math.min(page, pageCount - 1);
  const paged = sorted.slice(clampedPage * pageSize, clampedPage * pageSize + pageSize);

  useEffect(() => {
    setPage(0);
  }, [rows]);

  if (rows.length === 0) return <EmptyState icon={Search} message={emptyMessage} />;

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Report results, {rows.length} rows</caption>
          <thead>
            <tr className="border-b border-border bg-surfaceMuted text-xs uppercase tracking-wide text-muted">
              {columns.map((c) => (
                <th key={c.key} scope="col" className={`px-4 py-2 font-medium ${c.align === "right" ? "text-right" : "text-left"}`}>
                  {c.sortable ? (
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
            {paged.map((row) => (
              <tr key={row.id} className="hover:bg-surfaceMuted">
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-2 text-slate ${c.align === "right" ? "text-right" : "text-left"}`}>
                    {row.cells[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted">
          <span>
            {clampedPage * pageSize + 1}-{Math.min(clampedPage * pageSize + pageSize, sorted.length)} of {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(p - 1, 0))}
              disabled={clampedPage === 0}
              aria-label="Previous page"
              className="rounded-lg p-1.5 hover:bg-surfaceMuted hover:text-ink disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              Page {clampedPage + 1} of {pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(p + 1, pageCount - 1))}
              disabled={clampedPage >= pageCount - 1}
              aria-label="Next page"
              className="rounded-lg p-1.5 hover:bg-surfaceMuted hover:text-ink disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
