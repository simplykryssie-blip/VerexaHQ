"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Client, TaxReturn } from "@/lib/types";

const RETURN_TYPES = ["1040", "1120", "1120-S", "1065", "990", "1041"];
const STATUSES = [
  "not_started",
  "gathering_documents",
  "in_progress",
  "in_review",
  "ready_to_file",
  "filed",
  "amended",
];

export default function TaxReturnModal({
  clientId,
  taxReturn,
  onClose,
  onSaved,
  onDeleted,
}: {
  clientId?: string;
  taxReturn?: TaxReturn;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const isEditing = !!taxReturn;
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState(taxReturn?.client_id ?? clientId ?? "");
  const [taxYear, setTaxYear] = useState(
    taxReturn?.tax_year?.toString() ?? (new Date().getFullYear() - 1).toString()
  );
  const [returnType, setReturnType] = useState(taxReturn?.return_type ?? "1040");
  const [filingStatus, setFilingStatus] = useState(taxReturn?.filing_status ?? "");
  const [returnStatus, setReturnStatus] = useState(taxReturn?.return_status ?? "not_started");
  const [federalRefund, setFederalRefund] = useState(
    taxReturn?.federal_refund_amount?.toString() ?? ""
  );
  const [federalBalanceDue, setFederalBalanceDue] = useState(
    taxReturn?.federal_balance_due?.toString() ?? ""
  );
  const [notes, setNotes] = useState(taxReturn?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (clientId) return;
    supabase
      .from("clients")
      .select("id, first_name, last_name, business_name, client_type")
      .order("first_name")
      .then(({ data }) => setClients((data as Client[]) ?? []));
  }, [clientId]);

  function clientLabel(c: Client) {
    return c.client_type === "business" && c.business_name
      ? c.business_name
      : `${c.first_name} ${c.last_name}`.trim();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClientId) {
      setError("Choose a client for this return.");
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      tax_year: parseInt(taxYear, 10),
      return_type: returnType,
      filing_status: filingStatus || null,
      return_status: returnStatus,
      federal_refund_amount: federalRefund ? parseFloat(federalRefund) : null,
      federal_balance_due: federalBalanceDue ? parseFloat(federalBalanceDue) : null,
      notes,
    };

    if (isEditing) {
      const { error } = await supabase
        .from("tax_returns")
        .update(payload)
        .eq("id", taxReturn!.id);
      setSaving(false);
      if (error) {
        setError(error.message);
        return;
      }
      onSaved();
      onClose();
      return;
    }

    const { data: client } = await supabase
      .from("clients")
      .select("workspace_id")
      .eq("id", selectedClientId)
      .maybeSingle();

    if (!client) {
      setError("Could not find that client's workspace.");
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("tax_returns").insert({
      workspace_id: client.workspace_id,
      client_id: selectedClientId,
      ...payload,
    });

    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    onSaved();
    onClose();
  }

  async function handleDelete() {
    if (!taxReturn) return;
    if (
      !window.confirm(
        `Delete this ${taxReturn.tax_year} ${taxReturn.return_type} return? This can't be undone.`
      )
    )
      return;
    setDeleting(true);
    const { error } = await supabase.from("tax_returns").delete().eq("id", taxReturn.id);
    setDeleting(false);
    if (error) {
      setError(error.message);
      return;
    }
    onDeleted?.();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-sm border border-line w-full max-w-md p-6 max-h-[85vh] overflow-y-auto">
        <h3 className="font-slab text-lg font-bold text-ink mb-4">
          {isEditing ? "Edit Tax Return" : "New Tax Return"}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          {!clientId && !isEditing && (
            <select
              required
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm"
            >
              <option value="">Select client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {clientLabel(c)}
                </option>
              ))}
            </select>
          )}

          <div className="flex gap-2">
            <input
              required
              type="number"
              placeholder="Tax year"
              value={taxYear}
              onChange={(e) => setTaxYear(e.target.value)}
              className="w-1/2 border border-line rounded-sm px-3 py-2 text-sm"
            />
            <select
              value={returnType}
              onChange={(e) => setReturnType(e.target.value)}
              className="w-1/2 border border-line rounded-sm px-3 py-2 text-sm"
            >
              {RETURN_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <input
            placeholder="Filing status (e.g. Single, MFJ, MFS, HOH)"
            value={filingStatus}
            onChange={(e) => setFilingStatus(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />

          <select
            value={returnStatus}
            onChange={(e) => setReturnStatus(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replaceAll("_", " ")}
              </option>
            ))}
          </select>

          <div className="flex gap-2">
            <input
              type="number"
              step="0.01"
              placeholder="Federal refund"
              value={federalRefund}
              onChange={(e) => setFederalRefund(e.target.value)}
              className="w-1/2 border border-line rounded-sm px-3 py-2 text-sm"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Federal balance due"
              value={federalBalanceDue}
              onChange={(e) => setFederalBalanceDue(e.target.value)}
              className="w-1/2 border border-line rounded-sm px-3 py-2 text-sm"
            />
          </div>

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
            {isEditing && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="text-sm font-semibold py-2 px-3 rounded-sm border border-brick text-brick disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            )}
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
              {saving ? "Saving…" : isEditing ? "Save Changes" : "Create Return"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
