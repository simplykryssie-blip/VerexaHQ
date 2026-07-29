"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Invoice, Client } from "@/lib/types";
import StatusPill from "@/components/StatusPill";
import NewInvoiceModal from "@/components/NewInvoiceModal";

import { friendlyError } from "@/lib/friendlyError";
type Row = Invoice & { clientName: string };

export default function BillingPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .order("issue_date", { ascending: false });

    if (error) {
      setError(friendlyError(error, "Something went wrong. Please try again."));
      setLoading(false);
      return;
    }

    const list = (data as Invoice[]) ?? [];
    const clientIds = Array.from(new Set(list.map((i) => i.client_id)));
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

    setRows(list.map((i) => ({ ...i, clientName: clientsMap.get(i.client_id) ?? "—" })));
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("new") === "1") {
      setShowModal(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const visible = rows.filter((r) => statusFilter === "all" || r.invoice_status === statusFilter);

  const totals = useMemo(() => {
    const outstanding = rows
      .filter((r) => r.invoice_status !== "paid" && r.invoice_status !== "void")
      .reduce((s, r) => s + (r.total_amount - r.amount_paid), 0);
    const paidThisMonth = rows
      .filter((r) => r.paid_at && new Date(r.paid_at).getMonth() === new Date().getMonth())
      .reduce((s, r) => s + r.amount_paid, 0);
    return { outstanding, paidThisMonth };
  }, [rows]);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4 border-b border-line pb-3">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Billing
          </div>
          <h1 className="font-slab text-2xl font-bold text-ink">Invoices</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold px-3 py-1.5 rounded-sm bg-ink text-white">
            One-Time
          </span>
          <Link
            href="/billing/recurring"
            className="text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink"
          >
            Recurring
          </Link>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 bg-ink text-white text-sm font-semibold px-3.5 py-2 rounded-sm hover:bg-[#14273A] transition-colors"
          >
            <Plus size={15} /> New Invoice
          </button>
        </div>
      </div>

      {showModal && <NewInvoiceModal onClose={() => setShowModal(false)} onSaved={load} />}

      {error && (
        <div className="text-sm text-brick bg-brick/10 border border-brick/30 rounded-sm px-4 py-3 mb-4">
          {error}
        </div>
      )}

      <div className="flex gap-4 mb-4">
        <div className="bg-white border border-line rounded-sm p-4 flex-1">
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Outstanding
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-brick">
            ${totals.outstanding.toLocaleString()}
          </div>
        </div>
        <div className="bg-white border border-line rounded-sm p-4 flex-1">
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Paid This Month
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-green">
            ${totals.paidThisMonth.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {["all", "draft", "sent", "partially_paid", "paid", "void"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className="text-xs font-semibold px-3 py-1.5 rounded-sm border"
            style={{
              borderColor: statusFilter === s ? "#0D1B2A" : "#DDE3EC",
              backgroundColor: statusFilter === s ? "#0D1B2A" : "white",
              color: statusFilter === s ? "white" : "#0D1B2A",
            }}
          >
            {s === "all" ? "All" : s.replaceAll("_", " ")}
          </button>
        ))}
      </div>

      <div className="bg-white border border-line rounded-sm overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-widest text-muted">
              <th className="px-5 py-3 font-semibold">Client</th>
              <th className="px-5 py-3 font-semibold">Invoice #</th>
              <th className="px-5 py-3 font-semibold">Due</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paperDim">
            {loading && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-muted">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-muted">
                  No invoices yet.
                </td>
              </tr>
            )}
            {visible.map((inv) => (
              <tr key={inv.id} className="hover:bg-paper transition-colors">
                <td className="px-5 py-4">
                  <Link href={`/billing/${inv.id}`} className="font-semibold text-ink">
                    {inv.clientName}
                  </Link>
                </td>
                <td className="px-5 py-4 text-[#3E4A5B] font-mono">
                  {inv.invoice_number ?? "—"}
                </td>
                <td className="px-5 py-4 text-[#3E4A5B] font-mono">{inv.due_date ?? "—"}</td>
                <td className="px-5 py-4">
                  <StatusPill status={inv.invoice_status.replaceAll("_", " ")} />
                </td>
                <td className="px-5 py-4 text-right font-mono tabular-nums">
                  ${(inv.total_amount - inv.amount_paid).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
