"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";

export type PackageRow = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  flat_price: number | null;
  billing_cadence: string | null;
  revenue_share_percent: number | null;
  revenue_share_scope: string | null;
};

const inputClass = "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";
const labelClass = "block text-xs font-medium uppercase tracking-wide text-muted";

const REVENUE_SHARE_SCOPE_LABELS: Record<string, string> = {
  all_production: "all production (prep fees + bank products)",
  bank_products_only: "bank products only",
  prep_fees_only: "prep fees only",
};

function PackageCard({ pkg, canManage, onDeleted }: { pkg: PackageRow; canManage: boolean; onDeleted: () => void }) {
  const supabase = createClient();
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (!window.confirm(`Delete the "${pkg.name}" package? Firms already assigned to it will keep their history but lose the assignment.`)) return;
    setDeleting(true);
    const { error } = await supabase.from("firm_packages").delete().eq("id", pkg.id);
    setDeleting(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    onDeleted();
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-slate">{pkg.name}</p>
          {pkg.description && <p className="mt-1 text-sm text-muted">{pkg.description}</p>}
        </div>
        <TemplateStatusCycle table="firm_packages" id={pkg.id} status={pkg.status} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate">
        {pkg.flat_price != null && (
          <span className="rounded-lg bg-surfaceMuted px-2.5 py-1 font-medium">
            ${pkg.flat_price} {pkg.billing_cadence ? `/ ${pkg.billing_cadence.replace("_", " ")}` : ""}
          </span>
        )}
        {pkg.revenue_share_percent != null && (
          <span className="rounded-lg bg-surfaceMuted px-2.5 py-1 font-medium">
            {pkg.revenue_share_percent}% of {REVENUE_SHARE_SCOPE_LABELS[pkg.revenue_share_scope ?? "all_production"]}
          </span>
        )}
        {pkg.flat_price == null && pkg.revenue_share_percent == null && <span className="text-muted">No price or revenue share set yet.</span>}
      </div>
      <div className="mt-3 flex items-center gap-4">
        <Link
          href={`/settings/packages/${pkg.id}`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
        >
          <Pencil size={13} /> Edit package
        </Link>
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
    </div>
  );
}

function NewPackageForm({ workspaceId, onCreated }: { workspaceId: string; onCreated: () => void }) {
  const supabase = createClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [flatPrice, setFlatPrice] = useState("");
  const [billingCadence, setBillingCadence] = useState("monthly");
  const [revenueSharePercent, setRevenueSharePercent] = useState("");
  const [revenueShareScope, setRevenueShareScope] = useState("all_production");
  const [saving, setSaving] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("firm_packages").insert({
      workspace_id: workspaceId,
      name: name.trim(),
      description: description.trim() || null,
      flat_price: flatPrice.trim() ? Number(flatPrice) : null,
      billing_cadence: flatPrice.trim() ? billingCadence : null,
      revenue_share_percent: revenueSharePercent.trim() ? Number(revenueSharePercent) : null,
      revenue_share_scope: revenueSharePercent.trim() ? revenueShareScope : null,
    });
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setName("");
    setDescription("");
    setFlatPrice("");
    setRevenueSharePercent("");
    toast.show("Package created", "success");
    onCreated();
  }

  return (
    <form onSubmit={create} className="rounded-2xl border border-dashed border-border bg-surfaceMuted p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink">New package</p>
      <label className={`${labelClass} mt-3`}>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Partner Basic" className={inputClass} />
      </label>
      <label className={`${labelClass} mt-3`}>
        Description
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inputClass} />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className={labelClass}>
          Flat price ($)
          <input type="number" step="0.01" value={flatPrice} onChange={(e) => setFlatPrice(e.target.value)} className={inputClass} />
        </label>
        <label className={labelClass}>
          Billing cadence
          <select value={billingCadence} onChange={(e) => setBillingCadence(e.target.value)} disabled={!flatPrice.trim()} className={inputClass}>
            <option value="monthly">Monthly</option>
            <option value="annual">Annual</option>
            <option value="one_time">One time</option>
          </select>
        </label>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className={labelClass}>
          Revenue share (%)
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={revenueSharePercent}
            onChange={(e) => setRevenueSharePercent(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Applies to
          <select
            value={revenueShareScope}
            onChange={(e) => setRevenueShareScope(e.target.value)}
            disabled={!revenueSharePercent.trim()}
            className={inputClass}
          >
            <option value="all_production">All production</option>
            <option value="bank_products_only">Bank products only</option>
            <option value="prep_fees_only">Prep fees only</option>
          </select>
        </label>
      </div>
      <p className="mt-2 text-[11px] text-muted">Set a flat price, a revenue share, or both -- whatever matches how you actually structure the partnership.</p>
      <button
        type="submit"
        disabled={saving || !name.trim()}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
      >
        <Plus size={13} /> {saving ? "Creating..." : "Create package"}
      </button>
    </form>
  );
}

export function PackagesManager({ workspaceId, packages, canManage }: { workspaceId: string; packages: PackageRow[]; canManage: boolean }) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      {packages.length === 0 ? (
        <p className="text-sm text-muted">No packages yet -- define one below to start assigning firms to it.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {packages.map((p) => (
            <PackageCard key={p.id} pkg={p} canManage={canManage} onDeleted={() => router.refresh()} />
          ))}
        </div>
      )}
      {canManage && <NewPackageForm workspaceId={workspaceId} onCreated={() => router.refresh()} />}
    </div>
  );
}
