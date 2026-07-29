"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { InvoiceLineItem } from "@/lib/types";
import CurrencyInput from "@/components/CurrencyInput";
import ConfirmDialog from "@/components/ConfirmDialog";

import { friendlyError } from "@/lib/friendlyError";
export default function InvoiceLineItemModal({
  invoiceId,
  workspaceId,
  item,
  onClose,
  onSaved,
  onDeleted,
}: {
  invoiceId: string;
  workspaceId: string;
  item?: InvoiceLineItem;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const isEditing = !!item;
  const [itemName, setItemName] = useState(item?.item_name ?? "");
  const [quantity, setQuantity] = useState(item?.quantity?.toString() ?? "1");
  const [unitPrice, setUnitPrice] = useState(item?.unit_price?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const qty = parseFloat(quantity) || 1;
    const price = parseFloat(unitPrice) || 0;
    const payload = {
      item_name: itemName,
      quantity: qty,
      unit_price: price,
      line_total: qty * price,
    };

    if (isEditing) {
      const { error } = await supabase
        .from("invoice_line_items")
        .update(payload)
        .eq("id", item!.id);
      setSaving(false);
      if (error) {
        setError(friendlyError(error, "Something went wrong. Please try again."));
        return;
      }
      onSaved();
      onClose();
      return;
    }

    const { error } = await supabase.from("invoice_line_items").insert({
      workspace_id: workspaceId,
      invoice_id: invoiceId,
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
    if (!item) return;
    setDeleting(true);
    const { error } = await supabase.from("invoice_line_items").delete().eq("id", item.id);
    setDeleting(false);
    setConfirmingDelete(false);
    if (error) {
      setError(friendlyError(error, "Something went wrong. Please try again."));
      return;
    }
    onDeleted?.();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-sm border border-line w-full max-w-sm p-6">
        <h3 className="font-slab text-lg font-bold text-ink mb-4">
          {isEditing ? "Edit Line Item" : "Add Line Item"}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            required
            placeholder="Description"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <input
              type="number"
              step="0.01"
              placeholder="Qty"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-1/2 border border-line rounded-sm px-3 py-2 text-sm"
            />
            <CurrencyInput
              placeholder="Unit price"
              value={unitPrice}
              onChange={setUnitPrice}
              className="w-1/2"
            />
          </div>

          {error && (
            <div className="text-xs text-brick bg-brick/10 border border-brick/30 rounded-sm px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            {isEditing && (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={deleting}
                className="text-sm font-semibold py-2 px-3 rounded-sm border border-brick text-brick disabled:opacity-60"
              >
                {deleting ? "Removing…" : "Remove"}
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
              {saving ? "Saving…" : isEditing ? "Save Changes" : "Add Item"}
            </button>
          </div>
        </form>
      </div>
      <ConfirmDialog
        open={confirmingDelete}
        title="Remove this line item?"
        confirmLabel="Remove"
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
