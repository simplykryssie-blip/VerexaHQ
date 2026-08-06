"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { InvoicePreview, type PreviewLineItem } from "./InvoicePreview";

export function InvoiceQuoteForm({
  kind,
  workspaceId,
  clientId,
  engagementId,
  firmName,
  clientName,
  onDone,
}: {
  kind: "invoice" | "quote";
  workspaceId: string;
  clientId: string;
  engagementId?: string;
  firmName: string;
  clientName: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [title, setTitle] = useState("");
  const [lineItems, setLineItems] = useState<PreviewLineItem[]>([{ description: "", quantity: 1, unit_price: 0 }]);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const subtotal = lineItems.reduce((sum, li) => sum + li.quantity * li.unit_price, 0);
  const taxAmount = Math.max(subtotal - discountAmount, 0) * (taxRate / 100);
  const totalAmount = Math.max(subtotal - discountAmount, 0) + taxAmount;

  function updateItem(i: number, patch: Partial<PreviewLineItem>) {
    setLineItems((items) => items.map((li, idx) => (idx === i ? { ...li, ...patch } : li)));
  }

  function addItem() {
    setLineItems((items) => [...items, { description: "", quantity: 1, unit_price: 0 }]);
  }

  function removeItem(i: number) {
    setLineItems((items) => items.filter((_, idx) => idx !== i));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cleanItems = lineItems.filter((li) => li.description.trim());
    if (cleanItems.length === 0) {
      setError("Add at least one line item.");
      return;
    }
    if (kind === "quote" && !title.trim()) {
      setError("Enter a title.");
      return;
    }
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const payload = {
      workspace_id: workspaceId,
      client_id: clientId,
      engagement_id: engagementId ?? null,
      line_items: cleanItems,
      subtotal,
      discount_amount: discountAmount,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      notes: notes || null,
      created_by: user?.id,
    };

    const { error: insertError } =
      kind === "invoice"
        ? await supabase.from("invoices").insert({ ...payload, status: "sent", due_date: dueDate || null })
        : await supabase.from("quotes").insert({ ...payload, title: title.trim(), status: "sent", valid_until: dueDate || null });

    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    onDone();
    router.refresh();
  }

  return (
    <form onSubmit={create} className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        {kind === "quote" && (
          <label className="block text-sm font-medium text-slate">
            Title
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </label>
        )}

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-sm font-medium text-slate">Line items</label>
            <button type="button" onClick={addItem} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
              <Plus size={12} /> Add line
            </button>
          </div>
          <div className="space-y-2">
            {lineItems.map((li, i) => (
              <div key={i} className="flex items-end gap-2">
                <input
                  placeholder="Description"
                  value={li.description}
                  onChange={(e) => updateItem(i, { description: e.target.value })}
                  className="flex-1 rounded-lg border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={li.quantity}
                  onChange={(e) => updateItem(i, { quantity: Number(e.target.value) || 0 })}
                  className="w-16 rounded-lg border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={li.unit_price}
                  onChange={(e) => updateItem(i, { unit_price: Number(e.target.value) || 0 })}
                  className="w-24 rounded-lg border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  disabled={lineItems.length === 1}
                  className="rounded-lg p-1.5 text-muted hover:bg-surfaceMuted hover:text-danger disabled:opacity-40"
                  aria-label="Remove line"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <label className="text-xs text-muted">
            Discount ($)
            <input
              type="number"
              min={0}
              step="0.01"
              value={discountAmount}
              onChange={(e) => setDiscountAmount(Number(e.target.value) || 0)}
              className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </label>
          <label className="text-xs text-muted">
            Tax (%)
            <input
              type="number"
              min={0}
              step="0.01"
              value={taxRate}
              onChange={(e) => setTaxRate(Number(e.target.value) || 0)}
              className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </label>
          <label className="text-xs text-muted">
            {kind === "invoice" ? "Due date" : "Valid until"}
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </label>
        </div>

        <label className="block text-sm font-medium text-slate">
          Notes (optional)
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onDone} className="rounded-lg px-4 py-2 text-sm font-medium text-slate hover:bg-surfaceMuted">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
          >
            {saving ? "Creating..." : kind === "invoice" ? "Create invoice" : "Create quote"}
          </button>
        </div>
      </div>

      <div>
        <InvoicePreview
          kind={kind}
          firmName={firmName}
          clientName={clientName}
          number={null}
          issueDate={new Date().toISOString()}
          dueDate={dueDate || null}
          lineItems={lineItems}
          subtotal={subtotal}
          discountAmount={discountAmount}
          taxAmount={taxAmount}
          totalAmount={totalAmount}
          notes={notes}
        />
      </div>
    </form>
  );
}
