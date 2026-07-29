"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import CurrencyInput from "@/components/CurrencyInput";

import { friendlyError } from "@/lib/friendlyError";
const ADJUSTMENT_TYPES = ["Bank Fee", "Interest Earned", "NSF Fee", "Correction", "Other"];

export default function AdjustmentModal({
  workspaceId,
  clientId,
  financialAccountId,
  reconciliationSessionId,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  clientId: string;
  financialAccountId: string;
  reconciliationSessionId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [adjustmentType, setAdjustmentType] = useState(ADJUSTMENT_TYPES[0]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;

    const { error } = await supabase.from("bookkeeping_adjustments").insert({
      workspace_id: workspaceId,
      client_id: clientId,
      financial_account_id: financialAccountId,
      reconciliation_session_id: reconciliationSessionId,
      adjustment_date: date,
      adjustment_type: adjustmentType,
      description,
      amount: parseFloat(amount) || 0,
      created_by: userId,
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
      <div className="bg-white rounded-sm border border-line w-full max-w-sm p-6">
        <h3 className="font-slab text-lg font-bold text-ink mb-4">Add Adjustment</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <select
            value={adjustmentType}
            onChange={(e) => setAdjustmentType(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          >
            {ADJUSTMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <input
            required
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-1/2 border border-line rounded-sm px-3 py-2 text-sm"
            />
            <CurrencyInput
              required
              placeholder="Amount (+/-)"
              value={amount}
              onChange={setAmount}
              className="w-1/2"
            />
          </div>
          <p className="text-xs text-muted">
            Positive amounts increase the book balance (e.g. interest earned),
            negative decrease it (e.g. bank fees).
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
              {saving ? "Saving…" : "Add Adjustment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
