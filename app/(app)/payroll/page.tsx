"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { PayrollClient, Client } from "@/lib/types";
import StatusPill from "@/components/StatusPill";
import PayrollClientModal from "@/components/PayrollClientModal";

import { friendlyError } from "@/lib/friendlyError";
type Row = PayrollClient & { clientName: string };

export default function PayrollPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("payroll_clients")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setError(friendlyError(error, "Something went wrong. Please try again."));
      setLoading(false);
      return;
    }

    const list = (data as PayrollClient[]) ?? [];
    const clientIds = Array.from(new Set(list.map((p) => p.client_id)));
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

    setRows(list.map((p) => ({ ...p, clientName: clientsMap.get(p.client_id) ?? "—" })));
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4 border-b border-line pb-3">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Payroll Services
          </div>
          <h1 className="font-slab text-2xl font-bold text-ink">Payroll</h1>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 bg-ink text-white text-sm font-semibold px-3.5 py-2 rounded-sm hover:bg-[#14273A] transition-colors"
        >
          <Plus size={15} /> New Payroll Client
        </button>
      </div>

      {showModal && (
        <PayrollClientModal onClose={() => setShowModal(false)} onSaved={load} />
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
            No payroll clients yet. Click &quot;New Payroll Client&quot; to set up your
            first one.
          </div>
        )}
        {rows.map((p) => (
          <Link
            key={p.id}
            href={`/payroll/${p.id}`}
            className="flex flex-col gap-2 px-5 py-3.5 hover:bg-paper transition-colors sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div className="font-semibold text-ink text-sm">{p.clientName}</div>
              <div className="text-xs text-muted mt-0.5">
                {p.pay_frequency} {p.provider_name ? `· ${p.provider_name}` : "· No provider set"}
              </div>
            </div>
            <StatusPill status={p.payroll_status.replaceAll("_", " ")} />
          </Link>
        ))}
      </div>
    </div>
  );
}
