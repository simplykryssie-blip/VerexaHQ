"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type PricingRuleRow = {
  id: string;
  name: string;
  workspace_id: string | null;
  pricing_method: string;
  base_amount: number | null;
  hourly_rate: number | null;
};

const PRICING_METHODS = [
  { value: "flat_fee", label: "Flat fee" },
  { value: "hourly", label: "Hourly" },
  { value: "custom_quote", label: "Custom quote" },
  { value: "tax_form_based", label: "Tax form based" },
  { value: "complexity_based", label: "Complexity based" },
];

export function PricingRuleEditRow({ rule }: { rule: PricingRuleRow }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(rule.name);
  const [method, setMethod] = useState(rule.pricing_method);
  const [baseAmount, setBaseAmount] = useState(rule.base_amount?.toString() ?? "");
  const [hourlyRate, setHourlyRate] = useState(rule.hourly_rate?.toString() ?? "");
  const isSystem = !rule.workspace_id;

  async function save() {
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase
      .from("pricing_rules")
      .update({
        name,
        pricing_method: method,
        base_amount: baseAmount ? Number(baseAmount) : null,
        hourly_rate: hourlyRate ? Number(hourlyRate) : null,
      })
      .eq("id", rule.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="flex-1">
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-left text-slate hover:text-accent hover:underline">
        {rule.name} <span className="text-xs text-muted">({rule.pricing_method.replace(/_/g, " ")})</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-border bg-surfaceMuted p-3">
          {isSystem ? (
            <p className="text-xs text-muted">This is a system default and can&apos;t be edited here.</p>
          ) : (
            <>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {PRICING_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={baseAmount}
                  onChange={(e) => setBaseAmount(e.target.value)}
                  placeholder="Base amount"
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <input
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  placeholder="Hourly rate"
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              {error && <p className="text-sm text-danger">{error}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-sm text-slate hover:bg-surface">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

type BillingRuleRow = { id: string; name: string; workspace_id: string | null; invoice_timing: string };

const INVOICE_TIMINGS = [
  { value: "before_work", label: "Before work starts" },
  { value: "after_work", label: "After work completes" },
];

export function BillingRuleEditRow({ rule }: { rule: BillingRuleRow }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(rule.name);
  const [timing, setTiming] = useState(rule.invoice_timing);
  const isSystem = !rule.workspace_id;

  async function save() {
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase
      .from("billing_rules")
      .update({ name, invoice_timing: timing })
      .eq("id", rule.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="flex-1">
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-left text-slate hover:text-accent hover:underline">
        {rule.name} <span className="text-xs text-muted">({rule.invoice_timing.replace(/_/g, " ")})</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-border bg-surfaceMuted p-3">
          {isSystem ? (
            <p className="text-xs text-muted">This is a system default and can&apos;t be edited here.</p>
          ) : (
            <>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <select
                value={timing}
                onChange={(e) => setTiming(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {INVOICE_TIMINGS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              {error && <p className="text-sm text-danger">{error}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-sm text-slate hover:bg-surface">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
