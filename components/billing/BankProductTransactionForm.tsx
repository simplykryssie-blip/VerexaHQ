"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

const inputClass = "rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
const labelClass = "flex flex-col gap-1 text-xs text-muted";

export function BankProductTransactionForm({ workspaceId, engagementId }: { workspaceId: string; engagementId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [bankPartner, setBankPartner] = useState("");
  const [productType, setProductType] = useState<"refund_transfer" | "refund_advance" | "other">("refund_transfer");
  const [prepFee, setPrepFee] = useState("");
  const [bankFee, setBankFee] = useState("");
  const [addonFee, setAddonFee] = useState("");
  const [rebate, setRebate] = useState("");
  const [disbursementMethod, setDisbursementMethod] = useState<"" | "check" | "direct_deposit" | "prepaid_card">("");
  const [status, setStatus] = useState<"pending" | "funded" | "disbursed" | "rejected">("pending");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reset() {
    setBankPartner("");
    setProductType("refund_transfer");
    setPrepFee("");
    setBankFee("");
    setAddonFee("");
    setRebate("");
    setDisbursementMethod("");
    setStatus("pending");
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!bankPartner.trim()) {
      setError("Enter which bank issued this product.");
      return;
    }
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error: insertError } = await supabase.from("bank_product_transactions").insert({
      workspace_id: workspaceId,
      engagement_id: engagementId,
      bank_partner: bankPartner.trim(),
      product_type: productType,
      prep_fee_collected: prepFee ? Number(prepFee) : null,
      bank_fee: bankFee ? Number(bankFee) : null,
      addon_fee: addonFee ? Number(addonFee) : null,
      rebate_amount: rebate ? Number(rebate) : null,
      disbursement_method: disbursementMethod || null,
      status,
      created_by: user?.id,
    });

    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    toast.show("Bank product recorded", "success");
    reset();
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-accent hover:underline">
        + Record bank product
      </button>
    );
  }

  return (
    <form onSubmit={save} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surfaceMuted p-3">
      <label className={labelClass}>
        Bank partner
        <input
          required
          type="text"
          value={bankPartner}
          onChange={(e) => setBankPartner(e.target.value)}
          placeholder="Republic Bank, TPG, EPS..."
          className={`${inputClass} w-40`}
        />
      </label>
      <label className={labelClass}>
        Product
        <select value={productType} onChange={(e) => setProductType(e.target.value as typeof productType)} className={inputClass}>
          <option value="refund_transfer">Refund transfer</option>
          <option value="refund_advance">Refund advance</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label className={labelClass}>
        Prep fee
        <input type="number" min={0} step="0.01" value={prepFee} onChange={(e) => setPrepFee(e.target.value)} className={`${inputClass} w-24`} />
      </label>
      <label className={labelClass}>
        Bank fee
        <input type="number" min={0} step="0.01" value={bankFee} onChange={(e) => setBankFee(e.target.value)} className={`${inputClass} w-24`} />
      </label>
      <label className={labelClass}>
        Add-on fee
        <input type="number" min={0} step="0.01" value={addonFee} onChange={(e) => setAddonFee(e.target.value)} className={`${inputClass} w-24`} />
      </label>
      <label className={labelClass}>
        Rebate to us
        <input type="number" min={0} step="0.01" value={rebate} onChange={(e) => setRebate(e.target.value)} className={`${inputClass} w-24`} />
      </label>
      <label className={labelClass}>
        Disbursement
        <select value={disbursementMethod} onChange={(e) => setDisbursementMethod(e.target.value as typeof disbursementMethod)} className={inputClass}>
          <option value="">--</option>
          <option value="check">Check</option>
          <option value="direct_deposit">Direct deposit</option>
          <option value="prepaid_card">Prepaid card</option>
        </select>
      </label>
      <label className={labelClass}>
        Status
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={inputClass}>
          <option value="pending">Pending</option>
          <option value="funded">Funded</option>
          <option value="disbursed">Disbursed</option>
          <option value="rejected">Rejected</option>
        </select>
      </label>
      {error && <p className="w-full text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate hover:bg-surface"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}
