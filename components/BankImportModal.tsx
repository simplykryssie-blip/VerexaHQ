"use client";

import { useState } from "react";
import Papa from "papaparse";
import { supabase } from "@/lib/supabase";

import { friendlyError } from "@/lib/friendlyError";
const FIELD_OPTIONS = [
  { key: "transaction_date", label: "Transaction Date", required: true },
  { key: "amount", label: "Amount", required: true },
  { key: "description", label: "Description", required: true },
  { key: "payee", label: "Payee", required: false },
  { key: "memo", label: "Memo", required: false },
  { key: "reference_number", label: "Reference #", required: false },
  { key: "debit", label: "Debit (if separate column)", required: false },
  { key: "credit", label: "Credit (if separate column)", required: false },
];

export default function BankImportModal({
  workspaceId,
  clientId,
  financialAccountId,
  bookkeepingPeriodId,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  clientId: string;
  financialAccountId: string;
  bookkeepingPeriodId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [step, setStep] = useState<"upload" | "map" | "result">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [amountMode, setAmountMode] = useState<"single_amount" | "debit_credit">("single_amount");
  const [debitIsPositive, setDebitIsPositive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    imported_rows: number;
    duplicate_rows: number;
    error_rows: number;
  } | null>(null);

  function handleFile(f: File) {
    setFile(f);
    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const fields = results.meta.fields ?? [];
        setHeaders(fields);
        setRows(results.data as Record<string, string>[]);

        const autoMap: Record<string, string> = {};
        for (const h of fields) {
          const lower = h.toLowerCase();
          if (lower.includes("date")) autoMap.transaction_date = h;
          else if (lower === "amount") autoMap.amount = h;
          else if (lower.includes("debit")) autoMap.debit = h;
          else if (lower.includes("credit")) autoMap.credit = h;
          else if (lower.includes("desc")) autoMap.description = h;
          else if (lower.includes("payee") || lower.includes("merchant")) autoMap.payee = h;
          else if (lower.includes("memo") || lower.includes("note")) autoMap.memo = h;
          else if (lower.includes("ref")) autoMap.reference_number = h;
        }
        if (autoMap.debit || autoMap.credit) setAmountMode("debit_credit");
        setMapping(autoMap);
        setStep("map");
      },
      error: (err: Error) => setError(friendlyError(err, "Something went wrong. Please try again.")),
    });
  }

  function parseAmount(row: Record<string, string>): number {
    if (amountMode === "single_amount") {
      const raw = row[mapping.amount] ?? "0";
      return parseFloat(raw.replace(/[^0-9.-]/g, "")) || 0;
    }
    const debitRaw = parseFloat((row[mapping.debit] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
    const creditRaw = parseFloat((row[mapping.credit] ?? "0").replace(/[^0-9.-]/g, "")) || 0;
    const debit = debitIsPositive ? -Math.abs(debitRaw) : -Math.abs(debitRaw);
    return creditRaw + debit;
  }

  function normalizeDate(value: string): string {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return value;
  }

  async function handleImport() {
    if (!mapping.transaction_date || !mapping.description) {
      setError("Map at least Transaction Date and Description before importing.");
      return;
    }
    if (amountMode === "single_amount" && !mapping.amount) {
      setError("Map an Amount column, or switch to separate Debit/Credit columns.");
      return;
    }
    if (amountMode === "debit_credit" && !mapping.debit && !mapping.credit) {
      setError("Map at least a Debit or Credit column.");
      return;
    }

    setSaving(true);
    setError(null);

    const { data: batchData, error: batchError } = await supabase.rpc(
      "create_bookkeeping_import_batch",
      {
        p_workspace_id: workspaceId,
        p_client_id: clientId,
        p_financial_account_id: financialAccountId,
        p_bookkeeping_period_id: bookkeepingPeriodId,
        p_source_type: "csv",
        p_original_file_name: file?.name ?? "import.csv",
        p_storage_path: null,
        p_mapping_id: null,
      }
    );

    if (batchError || !batchData) {
      setError(batchError?.message ?? "Could not create import batch.");
      setSaving(false);
      return;
    }

    const batchId =
      typeof batchData === "string" ? batchData : (batchData as { id?: string; import_batch_id?: string }).id ??
        (batchData as { import_batch_id?: string }).import_batch_id;

    const parsedRows = rows.map((row) => ({
      transaction_date: normalizeDate(row[mapping.transaction_date] ?? ""),
      amount: parseAmount(row),
      description: row[mapping.description] ?? "",
      payee: mapping.payee ? row[mapping.payee] : null,
      memo: mapping.memo ? row[mapping.memo] : null,
      reference_number: mapping.reference_number ? row[mapping.reference_number] : null,
      transaction_type: "other",
    }));

    const { data: importResult, error: importError } = await supabase.rpc(
      "import_bookkeeping_transactions",
      {
        p_workspace_id: workspaceId,
        p_import_batch_id: batchId,
        p_rows: parsedRows,
      }
    );

    setSaving(false);
    if (importError) {
      setError(importError.message);
      return;
    }

    setResult(
      importResult as { imported_rows: number; duplicate_rows: number; error_rows: number }
    );
    setStep("result");
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-sm border border-line w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto">
        <h3 className="font-slab text-lg font-bold text-ink mb-4">Import Bank Statement</h3>

        {step === "upload" && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Export a CSV from your bank or credit card portal, then upload it
              here. You&apos;ll map the columns on the next step, and any
              transactions that look like duplicates of what&apos;s already
              entered will be flagged automatically.
            </p>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
              className="w-full text-sm"
            />
            {error && (
              <div className="text-xs text-brick bg-brick/10 border border-brick/30 rounded-sm px-3 py-2">
                {error}
              </div>
            )}
            <button
              onClick={onClose}
              className="w-full text-sm font-semibold py-2 rounded-sm border border-line text-ink"
            >
              Cancel
            </button>
          </div>
        )}

        {step === "map" && (
          <div className="space-y-3">
            <p className="text-xs text-muted">
              {rows.length} rows found. Match your file&apos;s columns to what
              VerexaHQ expects.
            </p>

            <div className="flex gap-2 mb-2">
              <button
                type="button"
                onClick={() => setAmountMode("single_amount")}
                className="flex-1 text-xs font-semibold py-2 rounded-sm border"
                style={{
                  borderColor: amountMode === "single_amount" ? "#0D1B2A" : "#DDE3EC",
                  backgroundColor: amountMode === "single_amount" ? "#0D1B2A" : "white",
                  color: amountMode === "single_amount" ? "white" : "#0D1B2A",
                }}
              >
                Single Amount Column
              </button>
              <button
                type="button"
                onClick={() => setAmountMode("debit_credit")}
                className="flex-1 text-xs font-semibold py-2 rounded-sm border"
                style={{
                  borderColor: amountMode === "debit_credit" ? "#0D1B2A" : "#DDE3EC",
                  backgroundColor: amountMode === "debit_credit" ? "#0D1B2A" : "white",
                  color: amountMode === "debit_credit" ? "white" : "#0D1B2A",
                }}
              >
                Separate Debit/Credit
              </button>
            </div>

            <div className="space-y-2">
              {FIELD_OPTIONS.filter((f) =>
                amountMode === "single_amount"
                  ? f.key !== "debit" && f.key !== "credit"
                  : f.key !== "amount"
              ).map((f) => (
                <div key={f.key} className="flex items-center gap-2">
                  <span className="text-xs text-ink w-40 shrink-0">
                    {f.label}
                    {f.required && <span className="text-brick"> *</span>}
                  </span>
                  <select
                    value={mapping[f.key] ?? ""}
                    onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}
                    className="flex-1 border border-line rounded-sm px-2 py-1.5 text-xs"
                  >
                    <option value="">— skip —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {amountMode === "debit_credit" && (
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={debitIsPositive}
                  onChange={(e) => setDebitIsPositive(e.target.checked)}
                  className="accent-[#0D1B2A]"
                />
                Debit column values are already negative
              </label>
            )}

            {rows.length > 0 && mapping.transaction_date && (
              <div className="bg-paper border border-line rounded-sm p-3 text-xs">
                <div className="font-semibold text-ink mb-1">Preview (first row)</div>
                <div className="text-muted">
                  {normalizeDate(rows[0][mapping.transaction_date] ?? "")} —{" "}
                  {mapping.description ? rows[0][mapping.description] : "—"} — $
                  {parseAmount(rows[0]).toFixed(2)}
                </div>
              </div>
            )}

            {error && (
              <div className="text-xs text-brick bg-brick/10 border border-brick/30 rounded-sm px-3 py-2">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setStep("upload")}
                className="flex-1 text-sm font-semibold py-2 rounded-sm border border-line text-ink"
              >
                Back
              </button>
              <button
                onClick={handleImport}
                disabled={saving}
                className="flex-1 text-sm font-semibold py-2 rounded-sm bg-ink text-white disabled:opacity-60"
              >
                {saving ? "Importing…" : `Import ${rows.length} Rows`}
              </button>
            </div>
          </div>
        )}

        {step === "result" && result && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white border border-line rounded-sm p-3 text-center">
                <div className="text-2xl font-bold font-mono text-green">
                  {result.imported_rows}
                </div>
                <div className="text-[11px] text-muted uppercase">Imported</div>
              </div>
              <div className="bg-white border border-line rounded-sm p-3 text-center">
                <div className="text-2xl font-bold font-mono text-amber">
                  {result.duplicate_rows}
                </div>
                <div className="text-[11px] text-muted uppercase">Duplicates</div>
              </div>
              <div className="bg-white border border-line rounded-sm p-3 text-center">
                <div className="text-2xl font-bold font-mono text-brick">
                  {result.error_rows}
                </div>
                <div className="text-[11px] text-muted uppercase">Errors</div>
              </div>
            </div>
            <p className="text-xs text-muted">
              Duplicates were detected against transactions already in this
              account and marked so they won&apos;t double-count — you can
              still review them in the ledger.
            </p>
            <button
              onClick={() => {
                onSaved();
                onClose();
              }}
              className="w-full text-sm font-semibold py-2 rounded-sm bg-ink text-white"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
