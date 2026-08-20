"use client";

import Papa from "papaparse";
import { Download, Printer } from "lucide-react";

function downloadCsv(rows: Record<string, string | number>[], filename: string) {
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function ExportButtons({ rows, filename }: { rows: Record<string, string | number>[]; filename: string }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => downloadCsv(rows, `${filename}.csv`)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate transition hover:border-accent hover:text-accent"
      >
        <Download size={14} aria-hidden="true" /> CSV
      </button>
      <button
        type="button"
        onClick={() => downloadCsv(rows, `${filename}.csv`)}
        title="Excel opens CSV files directly"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate transition hover:border-accent hover:text-accent"
      >
        <Download size={14} aria-hidden="true" /> Excel (CSV)
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        title="Opens your browser's print dialog -- choose 'Save as PDF' as the destination"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate transition hover:border-accent hover:text-accent"
      >
        <Printer size={14} aria-hidden="true" /> Print / PDF
      </button>
    </div>
  );
}
