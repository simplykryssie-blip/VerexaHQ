"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export type SoftwarePartnerRow = {
  id: string;
  name: string;
  standard_fee: number | null;
  is_active: boolean;
};

const inputClass = "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
const labelClass = "block text-xs font-medium uppercase tracking-wide text-muted";

function money(n: number | null) {
  return n == null ? "--" : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function SoftwarePartnerCard({ software, canManage, onDeleted }: { software: SoftwarePartnerRow; canManage: boolean; onDeleted: () => void }) {
  const supabase = createClient();
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (!window.confirm(`Delete "${software.name}"? PTINs currently assigned to it will keep their history but lose the assignment.`)) return;
    setDeleting(true);
    const { error } = await supabase.from("software_partners").delete().eq("id", software.id);
    setDeleting(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    onDeleted();
  }

  return (
    <div className="flex items-center justify-between rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <div>
        <p className="font-medium text-slate">{software.name}</p>
        <p className="mt-1 text-xs text-muted">Software fee: {money(software.standard_fee)}</p>
      </div>
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
  );
}

function NewSoftwarePartnerForm({ workspaceId, onCreated }: { workspaceId: string; onCreated: () => void }) {
  const supabase = createClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [standardFee, setStandardFee] = useState("");
  const [saving, setSaving] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("software_partners").insert({
      workspace_id: workspaceId,
      name: name.trim(),
      standard_fee: standardFee.trim() ? Number(standardFee) : null,
    });
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setName("");
    setStandardFee("");
    toast.show("Software added", "success");
    onCreated();
  }

  return (
    <form onSubmit={create} className="flex flex-wrap items-end gap-3 rounded-2xl border border-dashed border-border bg-surfaceMuted p-4">
      <label className={labelClass}>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Drake, TaxSlayer Pro, UltraTax..." className={`${inputClass} w-48`} />
      </label>
      <label className={labelClass}>
        Software fee ($)
        <input type="number" min={0} step="0.01" value={standardFee} onChange={(e) => setStandardFee(e.target.value)} className={`${inputClass} w-28`} />
      </label>
      <button
        type="submit"
        disabled={saving || !name.trim()}
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
      >
        <Plus size={13} /> {saving ? "Adding..." : "Add software"}
      </button>
    </form>
  );
}

export function SoftwarePartnersManager({
  workspaceId,
  softwareList,
  canManage,
}: {
  workspaceId: string;
  softwareList: SoftwarePartnerRow[];
  canManage: boolean;
}) {
  const router = useRouter();

  return (
    <div className="space-y-3">
      {softwareList.length === 0 ? (
        <p className="text-sm text-muted">No software added yet -- add one below to start assigning it to your PTINs.</p>
      ) : (
        <div className="space-y-2">
          {softwareList.map((s) => (
            <SoftwarePartnerCard key={s.id} software={s} canManage={canManage} onDeleted={() => router.refresh()} />
          ))}
        </div>
      )}
      {canManage && <NewSoftwarePartnerForm workspaceId={workspaceId} onCreated={() => router.refresh()} />}
    </div>
  );
}
