"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export type PackageDetail = {
  id: string;
  name: string;
  description: string | null;
  flat_price: number | null;
  billing_cadence: string | null;
  revenue_share_percent: number | null;
  revenue_share_scope: string | null;
};

const inputClass = "mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-surfaceMuted disabled:text-muted";
const labelClass = "block text-xs font-medium uppercase tracking-wide text-muted";

// Inline, save-on-blur fields (same pattern as the option groups below it and
// ManualFirmInfo) rather than a separate edit modal -- there's no reason to
// make changing a price a two-step "open editor, save, close" trip.
export function PackageEditForm({ pkg, canManage }: { pkg: PackageDetail; canManage: boolean }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();

  const [name, setName] = useState(pkg.name);
  const [description, setDescription] = useState(pkg.description ?? "");
  const [flatPrice, setFlatPrice] = useState(pkg.flat_price != null ? String(pkg.flat_price) : "");
  const [billingCadence, setBillingCadence] = useState(pkg.billing_cadence ?? "monthly");
  const [revenueSharePercent, setRevenueSharePercent] = useState(pkg.revenue_share_percent != null ? String(pkg.revenue_share_percent) : "");
  const [revenueShareScope, setRevenueShareScope] = useState(pkg.revenue_share_scope ?? "all_production");
  const [saving, setSaving] = useState(false);

  async function save(patch: Record<string, unknown>) {
    setSaving(true);
    const { error } = await supabase.from("firm_packages").update(patch as never).eq("id", pkg.id);
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  function saveName() {
    const trimmed = name.trim();
    if (!trimmed) {
      setName(pkg.name);
      return;
    }
    if (trimmed !== pkg.name) void save({ name: trimmed });
  }

  function saveDescription() {
    const trimmed = description.trim() || null;
    if (trimmed !== (pkg.description ?? null)) void save({ description: trimmed });
  }

  function savePricing(nextFlatPrice: string, nextCadence: string) {
    void save({
      flat_price: nextFlatPrice.trim() ? Number(nextFlatPrice) : null,
      billing_cadence: nextFlatPrice.trim() ? nextCadence : null,
    });
  }

  function saveRevenueShare(nextPercent: string, nextScope: string) {
    void save({
      revenue_share_percent: nextPercent.trim() ? Number(nextPercent) : null,
      revenue_share_scope: nextPercent.trim() ? nextScope : null,
    });
  }

  if (!canManage) {
    return (
      <div>
        <h1 className="font-display text-lg font-semibold text-ink">{pkg.name}</h1>
        {pkg.description && <p className="mt-1 text-sm text-muted">{pkg.description}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <label className={labelClass}>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} disabled={saving} className={inputClass} />
      </label>
      <label className={`${labelClass} mt-3`}>
        Description
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} onBlur={saveDescription} disabled={saving} rows={2} className={inputClass} />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className={labelClass}>
          Flat price ($)
          <input
            type="number"
            step="0.01"
            value={flatPrice}
            onChange={(e) => setFlatPrice(e.target.value)}
            onBlur={() => savePricing(flatPrice, billingCadence)}
            disabled={saving}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Billing cadence
          <select
            value={billingCadence}
            onChange={(e) => {
              setBillingCadence(e.target.value);
              savePricing(flatPrice, e.target.value);
            }}
            disabled={saving || !flatPrice.trim()}
            className={inputClass}
          >
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
            onBlur={() => saveRevenueShare(revenueSharePercent, revenueShareScope)}
            disabled={saving}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Applies to
          <select
            value={revenueShareScope}
            onChange={(e) => {
              setRevenueShareScope(e.target.value);
              saveRevenueShare(revenueSharePercent, e.target.value);
            }}
            disabled={saving || !revenueSharePercent.trim()}
            className={inputClass}
          >
            <option value="all_production">All production</option>
            <option value="bank_products_only">Bank products only</option>
            <option value="prep_fees_only">Prep fees only</option>
          </select>
        </label>
      </div>
    </div>
  );
}
