"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { RecurringInvoice, Client } from "@/lib/types";
import RecurringInvoiceModal from "@/components/RecurringInvoiceModal";

import { friendlyError } from "@/lib/friendlyError";
type Row = RecurringInvoice & { clientName: string };

function addInterval(dateStr: string, frequency: string): string {
  const d = new Date(dateStr + "T00:00:00");
  switch (frequency) {
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "quarterly":
      d.setMonth(d.getMonth() + 3);
      break;
    case "annually":
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString().slice(0, 10);
}

export default function RecurringInvoicesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<RecurringInvoice | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("recurring_invoices")
      .select("*")
      .order("next_invoice_date", { ascending: true });

    if (error) {
      setError(friendlyError(error, "Something went wrong. Please try again."));
      setLoading(false);
      return;
    }

    const list = (data as RecurringInvoice[]) ?? [];
    const clientIds = Array.from(new Set(list.map((r) => r.client_id)));
    let clientsMap = new Map<string, string>();
    if (clientIds.length > 0) {
      const { data: clientsData } = await supabase
        .from("clients")
        .select("id, first_name, last_name, business_name, client_type")
        .in("id", clientIds);
      (clientsData as Client[] | null)?.forEach((c) => {
        const name =
          c.client_type === "business" && c.business_name
            ? c.business_name
            : `${c.first_name} ${c.last_name}`.trim();
        clientsMap.set(c.id, name);
      });
    }

    setRows(list.map((r) => ({ ...r, clientName: clientsMap.get(r.client_id) ?? "—" })));
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function generateInvoiceNow(r: Row) {
    setGeneratingId(r.id);
    setError(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    const today = new Date().toISOString().slice(0, 10);

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        workspace_id: r.workspace_id,
        client_id: r.client_id,
        invoice_status: "draft",
        issue_date: today,
        subtotal: r.amount,
        total_amount: r.amount,
        created_by: userId,
      })
      .select()
      .single();

    if (invoiceError || !invoice) {
      setError(invoiceError?.message ?? "Failed to generate invoice.");
      setGeneratingId(null);
      return;
    }

    const { error: itemError } = await supabase.from("invoice_line_items").insert({
      workspace_id: r.workspace_id,
      invoice_id: invoice.id,
      item_name: r.service_type || "Recurring service",
      quantity: 1,
      unit_price: r.amount,
      line_total: r.amount,
      sort_order: 0,
    });

    if (itemError) {
      setError(itemError.message);
      setGeneratingId(null);
      return;
    }

    const nextDate = r.next_invoice_date
      ? addInterval(r.next_invoice_date, r.frequency)
      : addInterval(today, r.frequency);

    await supabase
      .from("recurring_invoices")
      .update({ last_invoice_date: today, next_invoice_date: nextDate })
      .eq("id", r.id);

    setGeneratingId(null);
    load();
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4 border-b border-line pb-3">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Billing
          </div>
          <h1 className="font-slab text-2xl font-bold text-ink">Recurring Invoices</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/billing"
            className="text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink"
          >
            One-Time
          </Link>
          <span className="text-xs font-semibold px-3 py-1.5 rounded-sm bg-ink text-white">
            Recurring
          </span>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 bg-ink text-white text-sm font-semibold px-3.5 py-2 rounded-sm hover:bg-[#14273A] transition-colors"
          >
            <Plus size={15} /> New Schedule
          </button>
        </div>
      </div>

      {showModal && (
        <RecurringInvoiceModal onClose={() => setShowModal(false)} onSaved={load} />
      )}
      {editing && (
        <RecurringInvoiceModal
          recurringInvoice={editing}
          onClose={() => setEditing(null)}
          onSaved={load}
          onDeleted={load}
        />
      )}

      {error && (
        <div className="text-sm text-brick bg-brick/10 border border-brick/30 rounded-sm px-4 py-3 mb-4">
          {error}
        </div>
      )}

      <div className="bg-white border border-line rounded-sm divide-y divide-paperDim">
        {loading && <div className="px-5 py-6 text-sm text-muted">Loading…</div>}
        {!loading && rows.length === 0 && (
          <div className="px-5 py-6 text-sm text-muted">
            No recurring invoices set up yet. Great for monthly bookkeeping or
            payroll fees.
          </div>
        )}
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between px-5 py-3.5">
            <button onClick={() => setEditing(r)} className="text-left flex-1">
              <div className="font-semibold text-ink text-sm">{r.clientName}</div>
              <div className="text-xs text-muted mt-0.5">
                {r.service_type} · {r.frequency} · ${r.amount.toLocaleString()}
              </div>
            </button>
            <div className="flex items-center gap-4">
              <span className="text-xs font-mono text-muted">
                Next: {r.next_invoice_date ?? "—"}
              </span>
              {r.is_active && (
                <button
                  onClick={() => generateInvoiceNow(r)}
                  disabled={generatingId === r.id}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-sm bg-ink text-white disabled:opacity-60"
                >
                  <Zap size={13} />
                  {generatingId === r.id ? "Generating…" : "Generate Now"}
                </button>
              )}
              {!r.is_active && (
                <span className="text-xs text-muted uppercase tracking-wide">Paused</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
