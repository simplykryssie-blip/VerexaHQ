"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export type BankPartnerRow = {
  id: string;
  name: string;
  standard_bank_fee: number | null;
  standard_transmission_fee: number | null;
  standard_paperwork_fee: number | null;
  standard_addon_fee: number | null;
  is_active: boolean;
};

const inputClass = "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
const labelClass = "block text-xs font-medium uppercase tracking-wide text-muted";

function money(n: number | null) {
  return n == null ? "--" : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function BankPartnerCard({ bank, canManage, onDeleted }: { bank: BankPartnerRow; canManage: boolean; onDeleted: () => void }) {
  const supabase = createClient();
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (!window.confirm(`Delete "${bank.name}"? PTINs currently assigned to it will keep their history but lose the assignment.`)) return;
    setDeleting(true);
    const { error } = await supabase.from("bank_partners").delete().eq("id", bank.id);
    setDeleting(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    onDeleted();
  }

  const fees = [
    ["Bank fee", bank.standard_bank_fee],
    ["Transmission", bank.standard_transmission_fee],
    ["Paperwork", bank.standard_paperwork_fee],
    ["Add-on", bank.standard_addon_fee],
  ] as const;

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium text-slate">{bank.name}</p>
        {canManage && (
          <button
            type="button"
            onClick={remove}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-danger hover:underline disabled:opacity-60"
          >
            <Trash2 size={13} /> Delete
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate">
        {fees.map(([label, value]) => (
          <span key={label} className="rounded-lg bg-surfaceMuted px-2.5 py-1 font-medium">
            {label}: {money(value)}
          </span>
        ))}
      </div>
    </div>
  );
}

function NewBankPartnerForm({ workspaceId, onCreated }: { workspaceId: string; onCreated: () => void }) {
  const supabase = createClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [bankFee, setBankFee] = useState("");
  const [transmissionFee, setTransmissionFee] = useState("");
  const [paperworkFee, setPaperworkFee] = useState("");
  const [addonFee, setAddonFee] = useState("");
  const [saving, setSaving] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("bank_partners").insert({
      workspace_id: workspaceId,
      name: name.trim(),
      standard_bank_fee: bankFee.trim() ? Number(bankFee) : null,
      standard_transmission_fee: transmissionFee.trim() ? Number(transmissionFee) : null,
      standard_paperwork_fee: paperworkFee.trim() ? Number(paperworkFee) : null,
      standard_addon_fee: addonFee.trim() ? Number(addonFee) : null,
    });
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setName("");
    setBankFee("");
    setTransmissionFee("");
    setPaperworkFee("");
    setAddonFee("");
    toast.show("Bank added", "success");
    onCreated();
  }

  return (
    <form onSubmit={create} className="rounded-2xl border border-dashed border-border bg-surfaceMuted p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink">Add a bank</p>
      <label className={`${labelClass} mt-3`}>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Republic Bank, TPG, EPS..." className={inputClass} />
      </label>
      <p className="mt-3 text-[11px] text-muted">
        Standard fees for this bank -- prefill whenever this bank is assigned to a PTIN and they record a return, still editable per return.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <label className={labelClass}>
          Bank fee ($)
          <input type="number" min={0} step="0.01" value={bankFee} onChange={(e) => setBankFee(e.target.value)} className={inputClass} />
        </label>
        <label className={labelClass}>
          Transmission fee ($)
          <input
            type="number"
            min={0}
            step="0.01"
            value={transmissionFee}
            onChange={(e) => setTransmissionFee(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Paperwork fee ($)
          <input type="number" min={0} step="0.01" value={paperworkFee} onChange={(e) => setPaperworkFee(e.target.value)} className={inputClass} />
        </label>
        <label className={labelClass}>
          Add-on fee ($)
          <input type="number" min={0} step="0.01" value={addonFee} onChange={(e) => setAddonFee(e.target.value)} className={inputClass} />
        </label>
      </div>
      <button
        type="submit"
        disabled={saving || !name.trim()}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
      >
        <Plus size={13} /> {saving ? "Adding..." : "Add bank"}
      </button>
    </form>
  );
}

export function BankPartnersManager({ workspaceId, banks, canManage }: { workspaceId: string; banks: BankPartnerRow[]; canManage: boolean }) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      {banks.length === 0 ? (
        <p className="text-sm text-muted">No banks added yet -- add one below to start assigning it to your PTINs.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {banks.map((b) => (
            <BankPartnerCard key={b.id} bank={b} canManage={canManage} onDeleted={() => router.refresh()} />
          ))}
        </div>
      )}
      {canManage && <NewBankPartnerForm workspaceId={workspaceId} onCreated={() => router.refresh()} />}
    </div>
  );
}
