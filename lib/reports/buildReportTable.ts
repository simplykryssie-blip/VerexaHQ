import type { ReactNode } from "react";
import type { ReportColumn, ReportRow } from "@/components/reports/SortableTable";

/** The column shape every report page already used before this fix -- render/sortValue
 * functions computed here, server-side, never crossing into the SortableTable client
 * component. Only their *output* (ReportRow.cells / sortValues) crosses that boundary. */
export type ReportColumnDef<T> = {
  key: string;
  label: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
};

export function buildReportTable<T extends { id: string }>(
  rows: T[],
  columnDefs: ReportColumnDef<T>[]
): { columns: ReportColumn[]; tableRows: ReportRow[] } {
  const columns: ReportColumn[] = columnDefs.map((c) => ({ key: c.key, label: c.label, align: c.align, sortable: Boolean(c.sortValue) }));
  const tableRows: ReportRow[] = rows.map((row) => {
    const cells: Record<string, ReactNode> = {};
    const sortValues: Record<string, string | number> = {};
    for (const c of columnDefs) {
      cells[c.key] = c.render(row);
      if (c.sortValue) sortValues[c.key] = c.sortValue(row);
    }
    return { id: row.id, cells, sortValues };
  });
  return { columns, tableRows };
}
