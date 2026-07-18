"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { BookkeepingFinancialAccount } from "@/lib/types";
import CurrencyInput from "@/components/CurrencyInput";

const ACCOUNT_TYPES = ["checking", "savings", "credit_card", "loan", "cash", "other"];

export default function FinancialAccountModal({
  clientId,
  engagementId,
  account,
  onClose,
  onSaved,
  onDeleted,
}: {
  clientId: string;
  engagementId: string;
  account?: BookkeepingFinancialAccount;
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const isEditing = !!account;
  const [name, setName] = useState(account?.account_name ?? "");
  const [type, setType] = useState(account?.account_type ?? "checking");
  const [institution, setInstitution] = useState(account?.institution_name ?? "");
  const [maskedNumber, setMaskedNumber] = useState(account?.masked_account_number ?? "");
  const [openingBalance, setOpeningBalance] = useState(
    account?.opening_balance?.toString() ?? "0"
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      account_name: name,
      account_type: type,
      institution_name: institution,
      masked_account_number: maskedNumber,
      opening_balance: openingBalance ? parseFloat(openingBalance) : 0,
    };

    if (isEditing) {
      const { error } = await supabase
        .from("bookkeeping_financial_accounts")
        .update(payload)
        .eq("id", account!.id);
      setSaving(false);
      if (error) {
        setError(error.message);
        return;
      }
      onSaved();
      onClose();
      return;
    }

    const { error } = await supabase.from("bookkeeping_financial_accounts").insert({
      client_id: clientId,
      engagement_id: engagementId,
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
    if (!account) return;
    if (!window.confirm(`Delete account "${account.account_name}"? This can't be undone.`)) return;
    setDeleting(true);
    const { error } = await supabase
      .from("bookkeeping_financial_accounts")
      .delete()
      .eq("id", account.id);
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
          {isEditing ? "Edit Account" : "New Financial Account"}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            required
            placeholder="Account name (e.g. Business Checking)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          >
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          <input
            placeholder="Institution (e.g. Chase, Capital One)"
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <input
            placeholder="Last 4 digits (e.g. ••••4821)"
            value={maskedNumber}
            onChange={(e) => setMaskedNumber(e.target.value)}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <CurrencyInput
            placeholder="Opening balance"
            value={openingBalance}
            onChange={setOpeningBalance}
            className="w-full"
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
              {saving ? "Saving…" : isEditing ? "Save Changes" : "Add Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
