"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Client, PayrollClient } from "@/lib/types";
import { maskEin } from "@/lib/organizerFormat";

import { friendlyError } from "@/lib/friendlyError";
const FREQUENCIES = ["weekly", "biweekly", "semimonthly", "monthly"];
const STATUSES = ["setup", "active", "on_hold", "offboarding", "closed"];

export default function PayrollClientModal({
  payrollClient,
  onClose,
  onSaved,
  onDeleted,
}: {
  payrollClient?: PayrollClient;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const isEditing = !!payrollClient;
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState(payrollClient?.client_id ?? "");
  const [legalName, setLegalName] = useState(payrollClient?.legal_name ?? "");
  const [fein, setFein] = useState(payrollClient?.fein ?? "");
  const [frequency, setFrequency] = useState(payrollClient?.pay_frequency ?? "biweekly");
  const [status, setStatus] = useState(payrollClient?.payroll_status ?? "setup");
  const [nextPayDate, setNextPayDate] = useState(payrollClient?.next_pay_date ?? "");
  const [providerName, setProviderName] = useState(payrollClient?.provider_name ?? "");
  const [notes, setNotes] = useState(payrollClient?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isEditing) return;
    supabase
      .from("clients")
      .select("id, first_name, last_name, business_name, client_type")
      .order("first_name")
      .then(({ data }) => setClients((data as Client[]) ?? []));
  }, [isEditing]);

  function clientLabel(c: Client) {
    return c.client_type === "business" && c.business_name
      ? c.business_name
      : `${c.first_name} ${c.last_name}`.trim();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isEditing && !selectedClientId) {
      setError("Choose a client.");
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      legal_name: legalName,
      fein,
      pay_frequency: frequency,
      payroll_status: status,
      next_pay_date: nextPayDate || null,
      provider_name: providerName || null,
      notes,
    };

    if (isEditing) {
      const { error } = await supabase
        .from("payroll_clients")
        .update(payload)
        .eq("id", payrollClient!.id);
      setSaving(false);
      if (error) {
        setError(friendlyError(error, "Something went wrong. Please try again."));
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

    const { error } = await supabase.from("payroll_clients").insert({
      workspace_id: client.workspace_id,
      client_id: selectedClientId,
      ...payload,
    });

    setSaving(false);
    if (error) {
      setError(friendlyError(error, "Something went wrong. Please try again."));
      return;
    }
    onSaved();
    onClose();
  }

  async function handleDelete() {
    if (!payrollClient) return;
    if (
      !window.confirm(
        "Delete this payroll engagement? Employees, runs, filings, and deposits under it will remain but become orphaned."
      )
    )
      return;
    setDeleting(true);
    const { error } = await supabase.from("payroll_clients").delete().eq("id", payrollClient.id);
    setDeleting(false);
    if (error) {
      setError(friendlyError(error, "Something went wrong. Please try again."));
      return;
    }
    onDeleted?.();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-sm border border-line w-full max-w-md p-6 max-h-[85vh] overflow-y-auto">
        <h3 className="font-slab text-lg font-bold text-ink mb-4">
          {isEditing ? "Edit Payroll Client" : "New Payroll Client"}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          {!isEditing && (
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

          <input
            placeholder="Legal business name"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <input
            placeholder="Federal Employer ID Number (EIN), e.g. 12-3456789"
            inputMode="numeric"
            value={fein}
            onChange={(e) => setFein(maskEin(e.target.value))}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />

          <div className="flex gap-2">
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              className="w-1/2 border border-line rounded-sm px-3 py-2 text-sm"
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-1/2 border border-line rounded-sm px-3 py-2 text-sm"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>

          <input
            type="date"
            placeholder="Next pay date"
            value={nextPayDate}
            onChange={(e) => setNextPayDate(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <input
            placeholder="Payroll provider (e.g. Gusto, ADP) — optional"
            value={providerName}
            onChange={(e) => setProviderName(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted">
            No payroll provider is connected yet — this just tracks who you use.
            Actual pay runs, direct deposit, and e-filing still need a licensed
            provider integration before money can move.
          </p>

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
              {saving ? "Saving…" : isEditing ? "Save Changes" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
