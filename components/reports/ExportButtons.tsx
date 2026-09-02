"use client";

import Papa from "papaparse";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";

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
      <Button variant="secondary" size="sm" onClick={() => downloadCsv(rows, `${filename}.csv`)}>
        <Download size={14} aria-hidden="true" /> CSV
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => downloadCsv(rows, `${filename}.csv`)}
        title="Excel opens CSV files directly"
      >
        <Download size={14} aria-hidden="true" /> Excel (CSV)
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => window.print()}
        title="Opens your browser's print dialog -- choose 'Save as PDF' as the destination"
      >
        <Printer size={14} aria-hidden="true" /> Print / PDF
      </Button>
    </div>
  );
}
