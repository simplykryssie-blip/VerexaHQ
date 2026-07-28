"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Document, BookkeepingReportDelivery } from "@/lib/types";

import { friendlyError } from "@/lib/friendlyError";
const REPORT_TYPES = [
  "profit_and_loss",
  "balance_sheet",
  "cash_flow",
  "general_ledger",
  "accounts_receivable",
  "accounts_payable",
  "custom",
];

export default function ReportDeliveryModal({
  workspaceId,
  clientId,
  bookkeepingPeriodId,
  report,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  clientId: string;
  bookkeepingPeriodId: string;
  report?: BookkeepingReportDelivery;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEditing = !!report;
  const [documents, setDocuments] = useState<Document[]>([]);
  const [reportType, setReportType] = useState(report?.report_type ?? "profit_and_loss");
  const [title, setTitle] = useState(report?.report_title ?? "");
  const [documentId, setDocumentId] = useState(report?.document_id ?? "");
  const [status, setStatus] = useState(report?.report_status ?? "draft");
  const [notes, setNotes] = useState(report?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("documents")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .then(({ data }) => setDocuments((data as Document[]) ?? []));
  }, [clientId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "ready_for_review" && !documentId) {
      setError("Attach a document before marking ready for review.");
      return;
    }
    setSaving(true);
    setError(null);

    const { error } = await supabase.rpc("save_bookkeeping_report_delivery", {
      p_workspace_id: workspaceId,
      p_bookkeeping_period_id: bookkeepingPeriodId,
      p_report_id: report?.id ?? null,
      p_report_type: reportType,
      p_report_title: title,
      p_document_id: documentId || null,
      p_report_status: status,
      p_notes: notes || null,
    });

    setSaving(false);
    if (error) {
      setError(friendlyError(error, "Something went wrong. Please try again."));
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-sm border border-line w-full max-w-md p-6">
        <h3 className="font-slab text-lg font-bold text-ink mb-4">
          {isEditing ? "Edit Report" : "New Report"}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          >
            {REPORT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          <input
            required
            placeholder="Report title (e.g. June 2026 P&L)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <select
            value={documentId}
            onChange={(e) => setDocumentId(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          >
            <option value="">No document attached yet</option>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.document_name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted">
            Upload the exported report (PDF from QuickBooks, etc.) under this
            client&apos;s Documents first, then attach it here.
          </p>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          >
            <option value="draft">Draft</option>
            <option value="ready_for_review">Ready for Review</option>
          </select>
          <textarea
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />

          {error && (
            <div className="text-xs text-brick bg-brick/10 border border-brick/30 rounded-sm px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 text-sm font-semibold py-2 rounded-sm border border-line text-ink"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 text-sm font-semibold py-2 rounded-sm bg-ink text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : isEditing ? "Save Changes" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
