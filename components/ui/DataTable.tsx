import type { ReactNode } from "react";
import { EmptyState } from "@/components/EmptyState";

export type DataTableColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
};

/**
 * Not a client component on purpose -- column `render` functions are plain
 * functions, and functions can't cross the server/client boundary as props.
 * Kept server-renderable so pages don't have to give up that pattern to use it.
 */
export function DataTable<T extends { id: string }>({
  columns,
  rows,
  emptyMessage,
  emptyAction,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  emptyMessage: string;
  emptyAction?: ReactNode;
}) {
  if (rows.length === 0) {
    return <EmptyState message={emptyMessage} action={emptyAction} />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
            {columns.map((col) => (
              <th key={col.key} className={`px-5 py-3 font-medium ${col.className ?? ""}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-surfaceMuted">
              {columns.map((col) => (
                <td key={col.key} className={`px-5 py-3 ${col.className ?? ""}`}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
