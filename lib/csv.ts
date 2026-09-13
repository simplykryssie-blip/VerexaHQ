import Papa from "papaparse";

// Shared CSV generation -- the one place row-to-CSV formatting/escaping
// happens, used by both client-side report exports (ExportButtons) and any
// server-rendered export data. UTF-8 by construction (plain JS strings);
// papaparse handles quoting/escaping per RFC 4180.
export function toCsv(rows: Record<string, string | number>[]): string {
  return Papa.unparse(rows);
}
