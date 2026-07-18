"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Invoice } from "@/lib/types";

const FREQUENCIES = ["weekly", "biweekly", "monthly"];

function addInterval(date: Date, frequency: string): Date {
  const d = new Date(date);
  if (frequency === "weekly") d.setDate(d.getDate() + 7);
  else if (frequency === "biweekly") d.setDate(d.getDate() + 14);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

export default function PaymentPlanModal({
  invoice,
  onClose,
  onSaved,
}: {
  invoice: Invoice;
  onClose: () => void;
  onSaved: () => void;
}) {
  const balanceDue = invoice.total_amount - invoice.amount_paid;
  const [installmentCount, setInstallmentCount] = useState("3");
  const [frequency, setFrequency] = useState("monthly");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const count = parseInt(installmentCount, 10) || 1;
  const perInstallment = balanceDue / count;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const { data: plan, error: planError } = await supabase
      .from("invoice_payment_plans")
      .insert({
        workspace_id: invoice.workspace_id,
        invoice_id: invoice.id,
        plan_status: "active",
        installment_count: count,
        installment_amount: perInstallment,
        start_date: startDate,
        frequency,
      })
      .select()
      .single();

    if (planError || !plan) {
      setError(planError?.message ?? "Failed to create payment plan.");
      setSaving(false);
      return;
    }

    const schedules = [];
    let dueDate = new Date(startDate + "T00:00:00");
    for (let i = 1; i <= count; i++) {
      schedules.push({
        workspace_id: invoice.workspace_id,
        invoice_id: invoice.id,
        payment_plan_id: plan.id,
        installment_number: i,
        amount: perInstallment,
        due_date: dueDate.toISOString().slice(0, 10),
        status: "pending",
      });
      dueDate = addInterval(dueDate, frequency);
    }

    const { error: scheduleError } = await supabase
      .from("payment_plan_schedules")
      .insert(schedules);

    setSaving(false);
    if (scheduleError) {
      setError(scheduleError.message);
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-sm border border-line w-full max-w-sm p-6">
        <h3 className="font-slab text-lg font-bold text-ink mb-4">Set Up Payment Plan</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="text-sm text-muted">
            Balance to split:{" "}
            <span className="font-mono font-semibold text-ink">${balanceDue.toFixed(2)}</span>
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              placeholder="# of installments"
              value={installmentCount}
              onChange={(e) => setInstallmentCount(e.target.value)}
              className="w-1/2 border border-line rounded-sm px-3 py-2 text-sm"
            />
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              className="w-1/2 border border-line rounded-sm px-3 py-2 text-sm"
            >
              {FREQUENCIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted">First payment due</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm mt-1"
            />
          </div>

          <div className="bg-paper border border-line rounded-sm px-3 py-2 text-sm font-mono text-ink">
            {count} × ${perInstallment.toFixed(2)}
          </div>

          <p className="text-xs text-muted">
            No payment processor is connected, so installments don&apos;t
            auto-charge — mark each one paid here as it comes in.
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
              {saving ? "Creating…" : "Create Plan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
