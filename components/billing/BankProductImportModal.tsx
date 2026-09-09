"use client";

import { useRef, useState } from "react";
import Papa from "papaparse";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { Modal } from "@/components/Modal";

const TEMPLATE_COLUMNS = [
  "Engagement Number",
  "Bank Partner",
  "Product Type",
  "Prep Fee Collected",
  "Bank Fee",
  "Addon Fee",
  "Rebate Amount",
  "Disbursement Method",
  "Status",
];

type ParsedRow = Record<string, string>;

function downloadTemplate() {
  const csv = Papa.unparse({
    fields: TEMPLATE_COLUMNS,
    data: [["ENG-2026-0001", "Republic Bank", "refund_transfer", "349.00", "39.95", "0", "40.00", "direct_deposit", "funded"]],
  });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "bank-products-template.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function BankProductImportModal({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; errors: { engagement_number: string; reason: string }[] } | null>(null);

  function handleFile(file: File) {
    setParseError(null);
    setResult(null);
    setFileName(file.name);
    Papa.parse<ParsedRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        if (results.errors.length > 0) {
          setParseError(results.errors[0].message);
          setRows([]);
          return;
        }
        setRows(results.data.filter((r) => r["Engagement Number"]?.trim()));
      },
      error: (err) => setParseError(err.message),
    });
  }

  async function runImport() {
    setImporting(true);
    setResult(null);
    const payload = rows.map((r) => ({
      engagement_number: r["Engagement Number"]?.trim(),
      bank_partner: r["Bank Partner"]?.trim(),
      product_type: r["Product Type"]?.trim().toLowerCase().replace(/\s+/g, "_"),
      prep_fee_collected: r["Prep Fee Collected"]?.trim(),
      bank_fee: r["Bank Fee"]?.trim(),
      addon_fee: r["Addon Fee"]?.trim(),
      rebate_amount: r["Rebate Amount"]?.trim(),
      disbursement_method: r["Disbursement Method"]?.trim().toLowerCase().replace(/\s+/g, "_"),
      status: r["Status"]?.trim().toLowerCase(),
    }));

    const { data, error } = await supabase.rpc("import_bank_product_transactions", {
      p_workspace_id: workspaceId,
      p_rows: payload,
    });

    setImporting(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    const parsed = data as { inserted: number; errors: { engagement_number: string; reason: string }[] };
    setResult(parsed);
    if (parsed.inserted > 0) {
      toast.show(`Imported ${parsed.inserted} bank product transaction${parsed.inserted === 1 ? "" : "s"}`, "success");
      router.refresh();
    }
  }

  return (
    <Modal title="Import bank products" onClose={onClose} size="xl">
      <div className="space-y-4 text-sm">
        <p className="text-muted">
          Download your bank&apos;s funded-transactions report and re-key it into our template (matching each row to the Verexa engagement
          number), or fill the template out directly. Every row needs an <span className="font-medium text-slate">Engagement Number</span> that
          matches an existing engagement.
        </p>

        <button type="button" onClick={downloadTemplate} className="text-xs font-medium text-accent hover:underline">
          Download CSV template
        </button>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
            className="block w-full text-sm text-slate file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate hover:file:border-accent hover:file:text-accent"
          />
          {fileName && <p className="mt-1 text-xs text-muted">{fileName}</p>}
        </div>

        {parseError && <p className="text-sm text-danger">{parseError}</p>}

        {rows.length > 0 && !result && (
          <div className="rounded-lg border border-border bg-surfaceMuted p-3">
            <p className="text-xs text-muted">{rows.length} row(s) ready to import.</p>
            <div className="mt-2 max-h-48 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-muted">
                  <tr>
                    <th className="pr-3 py-1">Engagement</th>
                    <th className="pr-3 py-1">Bank</th>
                    <th className="pr-3 py-1">Product</th>
                    <th className="pr-3 py-1">Rebate</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 20).map((r, i) => (
                    <tr key={i} className="text-slate">
                      <td className="pr-3 py-1">{r["Engagement Number"]}</td>
                      <td className="pr-3 py-1">{r["Bank Partner"]}</td>
                      <td className="pr-3 py-1">{r["Product Type"]}</td>
                      <td className="pr-3 py-1">{r["Rebate Amount"]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 20 && <p className="mt-1 text-muted">...and {rows.length - 20} more.</p>}
            </div>
          </div>
        )}

        {result && (
          <div className="rounded-lg border border-border bg-surfaceMuted p-3">
            <p className="text-slate">
              Imported <span className="font-medium">{result.inserted}</span> of {rows.length}.
            </p>
            {result.errors.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-danger">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    {e.engagement_number || "(blank)"}: {e.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate hover:bg-surfaceMuted">
            Close
          </button>
          <button
            type="button"
            onClick={runImport}
            disabled={rows.length === 0 || importing}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
          >
            {importing ? "Importing..." : `Import ${rows.length || ""} transaction${rows.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
