"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

export function CreatePaymentPlanForm({
  invoiceId,
  workspaceId,
  balanceDue,
}: {
  invoiceId: string;
  workspaceId: string;
  balanceDue: number;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [installments, setInstallments] = useState(3);
  const [firstDueDate, setFirstDueDate] = useState("");
  const [intervalDays, setIntervalDays] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!firstDueDate || installments < 2) {
      setError("Choose at least 2 installments and a first due date.");
      return;
    }
    setSaving(true);

    const base = Math.floor((balanceDue / installments) * 100) / 100;
    const rows = Array.from({ length: installments }, (_, i) => {
      const due = new Date(firstDueDate);
      due.setDate(due.getDate() + i * intervalDays);
      const isLast = i === installments - 1;
      const amount = isLast ? Math.round((balanceDue - base * (installments - 1)) * 100) / 100 : base;
      return {
        workspace_id: workspaceId,
        invoice_id: invoiceId,
        installment_number: i + 1,
        amount,
        due_date: due.toISOString().slice(0, 10),
      };
    });

    const { error: insertError } = await supabase.from("payment_plans").insert(rows);
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    toast.show("Payment plan created", "success");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-accent hover:underline">
        Set up payment plan
      </button>
    );
  }

  return (
    <form onSubmit={create} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surfaceMuted p-3">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Installments
        <input
          type="number"
          min={2}
          max={12}
          value={installments}
          onChange={(e) => setInstallments(Number(e.target.value))}
          className="w-20 rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        First due date
        <input
          required
          type="date"
          value={firstDueDate}
          onChange={(e) => setFirstDueDate(e.target.value)}
          className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Days between
        <input
          type="number"
          min={1}
          value={intervalDays}
          onChange={(e) => setIntervalDays(Number(e.target.value))}
          className="w-20 rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </label>
      {error && <p className="w-full text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate hover:bg-surface">
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
        >
          {saving ? "Creating..." : "Create plan"}
        </button>
      </div>
    </form>
  );
}
