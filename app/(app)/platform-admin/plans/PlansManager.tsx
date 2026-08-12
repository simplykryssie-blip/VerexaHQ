"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";

type Plan = {
  id: string;
  slug: string;
  name: string;
  base_price_cents: number;
  included_seats: number;
  per_seat_price_cents: number;
  email_overage_rate_cents: number;
  sms_overage_rate_cents: number;
  storage_overage_rate_cents: number;
  currency: string;
  is_active: boolean;
};

type FormState = {
  name: string;
  basePrice: string;
  includedSeats: string;
  perSeatPrice: string;
  emailRate: string;
  smsRate: string;
  storageRate: string;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  basePrice: "0",
  includedSeats: "1",
  perSeatPrice: "0",
  emailRate: "0",
  smsRate: "0",
  storageRate: "0",
  isActive: true,
};

function dollarsToCents(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function PlanForm({ initial, planId, onDone }: { initial: FormState; planId?: string; onDone: () => void }) {
  const supabase = createClient();
  const toast = useToast();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.name.trim()) {
      toast.show("Give this plan a name.", "error");
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      base_price_cents: dollarsToCents(form.basePrice),
      included_seats: parseInt(form.includedSeats, 10) || 0,
      per_seat_price_cents: dollarsToCents(form.perSeatPrice),
      email_overage_rate_cents: dollarsToCents(form.emailRate),
      sms_overage_rate_cents: dollarsToCents(form.smsRate),
      storage_overage_rate_cents: dollarsToCents(form.storageRate),
      is_active: form.isActive,
    };
    const { error } = planId
      ? await supabase.from("platform_subscription_plans").update(payload).eq("id", planId)
      : await supabase.from("platform_subscription_plans").insert({ ...payload, slug: slugify(form.name) });
    setSaving(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show(planId ? "Plan updated" : "Plan created", "success");
    onDone();
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div>
        <label className="block text-xs font-medium text-slate">Name</label>
        <input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Solo, Office, Bureau"
          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate">Base price / mo ($)</label>
          <input
            type="number"
            step="0.01"
            value={form.basePrice}
            onChange={(e) => setForm((f) => ({ ...f, basePrice: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate">Included seats</label>
          <input
            type="number"
            value={form.includedSeats}
            onChange={(e) => setForm((f) => ({ ...f, includedSeats: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate">Per extra seat / mo ($)</label>
          <input
            type="number"
            step="0.01"
            value={form.perSeatPrice}
            onChange={(e) => setForm((f) => ({ ...f, perSeatPrice: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate">Per email over included ($)</label>
          <input
            type="number"
            step="0.001"
            value={form.emailRate}
            onChange={(e) => setForm((f) => ({ ...f, emailRate: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate">Per SMS over included ($)</label>
          <input
            type="number"
            step="0.001"
            value={form.smsRate}
            onChange={(e) => setForm((f) => ({ ...f, smsRate: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate">Per GB storage over included ($)</label>
          <input
            type="number"
            step="0.01"
            value={form.storageRate}
            onChange={(e) => setForm((f) => ({ ...f, storageRate: e.target.value }))}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate">
        <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} className="h-3.5 w-3.5 rounded border-border" />
        Active (visible to assign to a workspace)
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="rounded-lg px-3 py-1.5 text-sm text-slate hover:bg-surfaceMuted">
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
        >
          {saving ? "Saving..." : planId ? "Save changes" : "Create plan"}
        </button>
      </div>
    </div>
  );
}

export function PlansManager({ plans }: { plans: Plan[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  function refreshAndClose() {
    setCreating(false);
    setEditingId(null);
    router.refresh();
  }

  function formForPlan(p: Plan): FormState {
    return {
      name: p.name,
      basePrice: centsToDollars(p.base_price_cents),
      includedSeats: String(p.included_seats),
      perSeatPrice: centsToDollars(p.per_seat_price_cents),
      emailRate: centsToDollars(p.email_overage_rate_cents),
      smsRate: centsToDollars(p.sms_overage_rate_cents),
      storageRate: centsToDollars(p.storage_overage_rate_cents),
      isActive: p.is_active,
    };
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90"
          >
            <Plus size={14} /> New plan
          </button>
        )}
      </div>

      {creating && <PlanForm initial={EMPTY_FORM} onDone={refreshAndClose} />}

      {plans.length === 0 && !creating ? (
        <div className="rounded-xl border border-border bg-surface">
          <EmptyState message="No plans yet. Create one to start assigning workspaces to it." />
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((p) =>
            editingId === p.id ? (
              <PlanForm key={p.id} initial={formForPlan(p)} planId={p.id} onDone={refreshAndClose} />
            ) : (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-ink">{p.name}</p>
                    {!p.is_active && <span className="rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-medium uppercase text-muted">Inactive</span>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    ${centsToDollars(p.base_price_cents)}/mo -- {p.included_seats} seat{p.included_seats === 1 ? "" : "s"} included, then $
                    {centsToDollars(p.per_seat_price_cents)}/seat
                  </p>
                </div>
                <button type="button" onClick={() => setEditingId(p.id)} className="text-muted hover:text-ink" aria-label={`Edit ${p.name}`}>
                  <Pencil size={14} />
                </button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
