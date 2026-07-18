"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Client } from "@/lib/types";
import CurrencyInput from "@/components/CurrencyInput";

type DraftLineItem = { item_name: string; quantity: string; unit_price: string };

export default function NewInvoiceModal({
  clientId,
  onClose,
  onSaved,
}: {
  clientId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState(clientId ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [lineItems, setLineItems] = useState<DraftLineItem[]>([
    { item_name: "", quantity: "1", unit_price: "" },
  ]);
  const [saving, setSaving] = useState(false);
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

  function updateItem(idx: number, field: keyof DraftLineItem, value: string) {
    setLineItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  }
  function addItem() {
    setLineItems((prev) => [...prev, { item_name: "", quantity: "1", unit_price: "" }]);
  }
  function removeItem(idx: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  }

  const subtotal = lineItems.reduce(
    (sum, it) => sum + (parseFloat(it.quantity) || 0) * (parseFloat(it.unit_price) || 0),
    0
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClientId) {
      setError("Choose a client.");
      return;
    }
    setSaving(true);
    setError(null);

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

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        workspace_id: client.workspace_id,
        client_id: selectedClientId,
        invoice_number: invoiceNumber || null,
        invoice_status: "draft",
        issue_date: issueDate,
        due_date: dueDate || null,
        subtotal,
        total_amount: subtotal,
        created_by: userId,
      })
      .select()
      .single();

    if (invoiceError || !invoice) {
      setError(invoiceError?.message ?? "Failed to create invoice.");
      setSaving(false);
      return;
    }

    const rows = lineItems
      .filter((it) => it.item_name.trim())
      .map((it, idx) => ({
        workspace_id: client.workspace_id,
        invoice_id: invoice.id,
        item_name: it.item_name,
        quantity: parseFloat(it.quantity) || 1,
        unit_price: parseFloat(it.unit_price) || 0,
        line_total: (parseFloat(it.quantity) || 1) * (parseFloat(it.unit_price) || 0),
        sort_order: idx,
      }));

    if (rows.length > 0) {
      const { error: itemsError } = await supabase.from("invoice_line_items").insert(rows);
      if (itemsError) {
        setError(itemsError.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-sm border border-line w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto">
        <h3 className="font-slab text-lg font-bold text-ink mb-4">New Invoice</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          {!clientId && (
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
              placeholder="Invoice # (optional, auto if blank)"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              className="flex-1 border border-line rounded-sm px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <div className="w-1/2">
              <label className="text-xs text-muted">Issue date</label>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full border border-line rounded-sm px-3 py-2 text-sm mt-1"
              />
            </div>
            <div className="w-1/2">
              <label className="text-xs text-muted">Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full border border-line rounded-sm px-3 py-2 text-sm mt-1"
              />
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-ink mb-2">Line Items</div>
            <div className="space-y-2">
              {lineItems.map((it, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    placeholder="Description"
                    value={it.item_name}
                    onChange={(e) => updateItem(idx, "item_name", e.target.value)}
                    className="flex-1 border border-line rounded-sm px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Qty"
                    value={it.quantity}
                    onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                    className="w-16 border border-line rounded-sm px-2 py-2 text-sm"
                  />
                  <CurrencyInput
                    placeholder="Price"
                    value={it.unit_price}
                    onChange={(value) => updateItem(idx, "unit_price", value)}
                    className="w-28"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="text-muted hover:text-brick"
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addItem}
              className="mt-2 flex items-center gap-1 text-xs font-semibold text-ink"
            >
              <Plus size={13} /> Add line item
            </button>
          </div>

          <div className="bg-paper border border-line rounded-sm px-3 py-2 text-right text-sm font-mono font-semibold text-ink">
            Total: ${subtotal.toFixed(2)}
          </div>

          <p className="text-xs text-muted">
            No payment processor is connected, so this invoice is tracked
            manually — no payment link goes out automatically. You can still
            send it however you like and record payments as they come in.
          </p>

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
              {saving ? "Creating…" : "Create Invoice"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
