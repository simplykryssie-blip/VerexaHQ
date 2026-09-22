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
  purchase_purpose: string;
  stripe_payment_link_id: string | null;
  stripe_payment_link_url: string | null;
  stripe_price_id: string | null;
  stripe_product_id: string | null;
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
  const [purchasePurpose, setPurchasePurpose] = useState(pkg.purchase_purpose);
  const [stripePaymentLinkId, setStripePaymentLinkId] = useState(pkg.stripe_payment_link_id ?? "");
  const [stripePaymentLinkUrl, setStripePaymentLinkUrl] = useState(pkg.stripe_payment_link_url ?? "");
  const [stripePriceId, setStripePriceId] = useState(pkg.stripe_price_id ?? "");
  const [stripeProductId, setStripeProductId] = useState(pkg.stripe_product_id ?? "");
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

  function savePurchasePurpose(next: string) {
    setPurchasePurpose(next);
    void save({ purchase_purpose: next });
  }

  function saveStripeField(field: "stripe_payment_link_id" | "stripe_payment_link_url" | "stripe_price_id" | "stripe_product_id", value: string) {
    const trimmed = value.trim() || null;
    void save({ [field]: trimmed });
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
      <label className={`${labelClass} mt-3`}>
        When purchased
        <select value={purchasePurpose} onChange={(e) => savePurchasePurpose(e.target.value)} disabled={saving} className={inputClass}>
          <option value="partner_onboarding">Start partner onboarding (Service Bureau/ERO/PTIN relationship)</option>
          <option value="service_only">Record the purchase only -- no partner onboarding</option>
        </select>
      </label>
      <div className="mt-4 border-t border-border pt-4">
        <p className={labelClass}>Stripe mapping</p>
        <p className="mt-1 text-xs text-muted">
          Map this package to a Stripe Payment Link so a completed checkout on your public website is automatically recognized as a purchase of{" "}
          <em>this</em> package. Set up the purchase webhook below first.
        </p>
        <label className={`${labelClass} mt-3`}>
          Stripe Payment Link ID
          <input
            placeholder="plink_..."
            value={stripePaymentLinkId}
            onChange={(e) => setStripePaymentLinkId(e.target.value)}
            onBlur={() => saveStripeField("stripe_payment_link_id", stripePaymentLinkId)}
            disabled={saving}
            className={inputClass}
          />
          <span className="mt-1 block text-[11px] font-normal normal-case text-muted">From the Payment Link&apos;s own settings in Stripe -- used to match a completed checkout back to this package.</span>
        </label>
        <label className={`${labelClass} mt-3`}>
          Stripe Payment Link URL
          <input
            placeholder="https://buy.stripe.com/..."
            value={stripePaymentLinkUrl}
            onChange={(e) => setStripePaymentLinkUrl(e.target.value)}
            onBlur={() => saveStripeField("stripe_payment_link_url", stripePaymentLinkUrl)}
            disabled={saving}
            className={inputClass}
          />
          <span className="mt-1 block text-[11px] font-normal normal-case text-muted">The actual link customers click -- used for the &quot;Purchase Now&quot; button on your website.</span>
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className={labelClass}>
            Stripe Price ID
            <input
              placeholder="price_..."
              value={stripePriceId}
              onChange={(e) => setStripePriceId(e.target.value)}
              onBlur={() => saveStripeField("stripe_price_id", stripePriceId)}
              disabled={saving}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Stripe Product ID
            <input
              placeholder="prod_..."
              value={stripeProductId}
              onChange={(e) => setStripeProductId(e.target.value)}
              onBlur={() => saveStripeField("stripe_product_id", stripeProductId)}
              disabled={saving}
              className={inputClass}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
