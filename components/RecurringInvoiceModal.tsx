"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Client, RecurringInvoice } from "@/lib/types";

const FREQUENCIES = ["weekly", "monthly", "quarterly", "annually"];

export default function RecurringInvoiceModal({
  clientId,
  recurringInvoice,
  onClose,
  onSaved,
  onDeleted,
}: {
  clientId?: string;
  recurringInvoice?: RecurringInvoice;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const isEditing = !!recurringInvoice;
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState(recurringInvoice?.client_id ?? clientId ?? "");
  const [serviceType, setServiceType] = useState(recurringInvoice?.service_type ?? "");
  const [amount, setAmount] = useState(recurringInvoice?.amount?.toString() ?? "");
  const [frequency, setFrequency] = useState(recurringInvoice?.frequency ?? "monthly");
  const [nextInvoiceDate, setNextInvoiceDate] = useState(
    recurringInvoice?.next_invoice_date ?? new Date().toISOString().slice(0, 10)
  );
  const [isActive, setIsActive] = useState(recurringInvoice?.is_active ?? true);
  const [notes, setNotes] = useState(recurringInvoice?.notes ?? "");
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
      setError("Choose a client.");
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      service_type: serviceType,
      amount: amount ? parseFloat(amount) : 0,
      frequency,
      next_invoice_date: nextInvoiceDate || null,
      is_active: isActive,
      notes,
    };

    if (isEditing) {
      const { error } = await supabase
        .from("recurring_invoices")
        .update(payload)
        .eq("id", recurringInvoice!.id);
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

    const { error } = await supabase.from("recurring_invoices").insert({
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
    if (!recurringInvoice) return;
    if (!window.confirm("Delete this recurring invoice schedule?")) return;
    setDeleting(true);
    const { error } = await supabase
      .from("recurring_invoices")
      .delete()
      .eq("id", recurringInvoice.id);
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
      <div className="bg-white rounded-sm border border-line w-full max-w-md p-6">
        <h3 className="font-slab text-lg font-bold text-ink mb-4">
          {isEditing ? "Edit Recurring Invoice" : "New Recurring Invoice"}
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

          <input
            required
            placeholder="Service (e.g. Monthly Bookkeeping)"
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <input
              required
              type="number"
              step="0.01"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-1/2 border border-line rounded-sm px-3 py-2 text-sm"
            />
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
          </div>
          <div>
            <label className="text-xs text-muted">Next invoice date</label>
            <input
              type="date"
              value={nextInvoiceDate}
              onChange={(e) => setNextInvoiceDate(e.target.value)}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm mt-1"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="accent-[#0D1B2A]"
            />
            Active
          </label>
          <textarea
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <p className="text-xs text-muted">
            No payment processor is connected, so nothing auto-charges. Use
            "Generate Invoice Now" on this schedule when it&apos;s time to bill,
            and it&apos;ll create a real invoice with this amount.
          </p>

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
              {saving ? "Saving…" : isEditing ? "Save Changes" : "Create Schedule"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
