"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { BookkeepingTransaction, BookkeepingTransactionCategory } from "@/lib/types";
import CurrencyInput from "@/components/CurrencyInput";

import { friendlyError } from "@/lib/friendlyError";
export default function TransactionModal({
  clientId,
  workspaceId,
  financialAccountId,
  periodId,
  transaction,
  onClose,
  onSaved,
  onDeleted,
}: {
  clientId: string;
  workspaceId: string;
  financialAccountId: string;
  periodId: string | null;
  transaction?: BookkeepingTransaction;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const isEditing = !!transaction;
  const [categories, setCategories] = useState<BookkeepingTransactionCategory[]>([]);
  const [date, setDate] = useState(
    transaction?.transaction_date ?? new Date().toISOString().slice(0, 10)
  );
  const [description, setDescription] = useState(transaction?.description ?? "");
  const [payee, setPayee] = useState(transaction?.payee ?? "");
  const [amount, setAmount] = useState(transaction?.amount?.toString() ?? "");
  const [categoryId, setCategoryId] = useState(transaction?.category_id ?? "");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [status, setStatus] = useState(transaction?.status ?? "uncategorized");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadCategories() {
    const { data } = await supabase
      .from("bookkeeping_transaction_categories")
      .select("*")
      .eq("is_active", true)
      .order("category_name");
    setCategories((data as BookkeepingTransactionCategory[]) ?? []);
  }

  useEffect(() => {
    loadCategories();
  }, []);

  async function handleAddCategory() {
    if (!newCategoryName.trim()) return;
    const { data, error } = await supabase
      .from("bookkeeping_transaction_categories")
      .insert({ workspace_id: workspaceId, category_name: newCategoryName.trim() })
      .select()
      .single();
    if (!error && data) {
      setCategories((prev) => [...prev, data as BookkeepingTransactionCategory]);
      setCategoryId((data as BookkeepingTransactionCategory).id);
      setNewCategoryName("");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      transaction_date: date,
      description,
      payee,
      amount: amount ? parseFloat(amount) : 0,
      category_id: categoryId || null,
      status: categoryId ? "categorized" : status,
    };

    if (isEditing) {
      const { error } = await supabase
        .from("bookkeeping_transactions")
        .update(payload)
        .eq("id", transaction!.id);
      setSaving(false);
      if (error) {
        setError(friendlyError(error, "Something went wrong. Please try again."));
        return;
      }
      onSaved();
      onClose();
      return;
    }

    const { error } = await supabase.from("bookkeeping_transactions").insert({
      workspace_id: workspaceId,
      client_id: clientId,
      financial_account_id: financialAccountId,
      bookkeeping_period_id: periodId,
      transaction_type: "other",
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
    if (!transaction) return;
    if (!window.confirm("Delete this transaction? This can't be undone.")) return;
    setDeleting(true);
    const { error } = await supabase
      .from("bookkeeping_transactions")
      .delete()
      .eq("id", transaction.id);
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
      <div className="bg-white rounded-sm border border-line w-full max-w-md p-6">
        <h3 className="font-slab text-lg font-bold text-ink mb-4">
          {isEditing ? "Edit Transaction" : "New Transaction"}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            required
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <input
            required
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <input
            placeholder="Payee (optional)"
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <CurrencyInput
            required
            placeholder="Amount (negative for money out)"
            value={amount}
            onChange={setAmount}
            className="w-full"
          />

          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          >
            <option value="">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.category_name}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              placeholder="Quick-add a new category…"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              className="flex-1 border border-line rounded-sm px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={handleAddCategory}
              className="text-xs font-semibold px-3 py-2 rounded-sm border border-line text-ink"
            >
              Add
            </button>
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
              {saving ? "Saving…" : isEditing ? "Save Changes" : "Add Transaction"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
