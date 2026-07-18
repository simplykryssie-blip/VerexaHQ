"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { TaxReturn, Client } from "@/lib/types";
import StatusPill from "@/components/StatusPill";
import TaxReturnModal from "@/components/TaxReturnModal";

type ReturnWithClient = TaxReturn & { clientName: string };

export default function TaxPrepPage() {
  const [returns, setReturns] = useState<ReturnWithClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [yearFilter, setYearFilter] = useState<string>("all");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("tax_returns")
      .select("*")
      .order("tax_year", { ascending: false });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const list = (data as TaxReturn[]) ?? [];
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

    setReturns(list.map((r) => ({ ...r, clientName: clientsMap.get(r.client_id) ?? "—" })));
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const years = useMemo(
    () => Array.from(new Set(returns.map((r) => r.tax_year))).sort((a, b) => b - a),
    [returns]
  );

  const visible = returns.filter(
    (r) => yearFilter === "all" || r.tax_year.toString() === yearFilter
  );

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of visible) counts[r.return_status] = (counts[r.return_status] ?? 0) + 1;
    return counts;
  }, [visible]);

  return (
    <div>
      <div className="flex items-end justify-between mb-4 border-b border-line pb-3">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Filing Season
          </div>
          <h1 className="font-slab text-2xl font-bold text-ink">Tax Prep</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-3 py-1.5 rounded-sm bg-ink text-white">
            Returns
          </span>
          <Link
            href="/tax/organizers"
            className="text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink"
          >
            Organizers
          </Link>
          {years.length > 0 && (
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="text-xs font-semibold px-3 py-1.5 rounded-sm border border-line text-ink"
            >
              <option value="all">All years</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 bg-ink text-white text-sm font-semibold px-3.5 py-2 rounded-sm hover:bg-[#14273A] transition-colors"
          >
            <Plus size={15} /> New Return
          </button>
        </div>
      </div>

      {showModal && (
        <TaxReturnModal onClose={() => setShowModal(false)} onSaved={load} />
      )}

      {error && (
        <div className="text-sm text-brick bg-brick/10 border border-brick/30 rounded-sm px-4 py-3 mb-4">
          {error}
        </div>
      )}

      {Object.keys(statusCounts).length > 0 && (
        <div className="flex flex-wrap gap-3 mb-4">
          {Object.entries(statusCounts).map(([status, count]) => (
            <div
              key={status}
              className="bg-white border border-line rounded-sm px-4 py-2 flex items-center gap-2"
            >
              <StatusPill status={status.replaceAll("_", " ")} />
              <span className="text-sm font-mono tabular-nums text-ink">{count}</span>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white border border-line rounded-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-widest text-muted">
              <th className="px-5 py-3 font-semibold">Client</th>
              <th className="px-5 py-3 font-semibold">Year</th>
              <th className="px-5 py-3 font-semibold">Type</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold">Refund / Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paperDim">
            {loading && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-muted">
                  Loading returns…
                </td>
              </tr>
            )}
            {!loading && visible.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-muted">
                  No tax returns yet. Click &quot;New Return&quot; to add the first one.
                </td>
              </tr>
            )}
            {visible.map((r) => {
              const net =
                (r.federal_refund_amount ?? 0) - (r.federal_balance_due ?? 0);
              return (
                <tr key={r.id} className="hover:bg-paper transition-colors">
                  <td className="px-5 py-4">
                    <Link href={`/tax/${r.id}`} className="font-semibold text-ink">
                      {r.clientName}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-[#3E4A5B] font-mono">{r.tax_year}</td>
                  <td className="px-5 py-4 text-[#3E4A5B]">{r.return_type}</td>
                  <td className="px-5 py-4">
                    <StatusPill status={r.return_status.replaceAll("_", " ")} />
                  </td>
                  <td className="px-5 py-4">
                    {net !== 0 ? (
                      <span
                        className="font-mono tabular-nums font-semibold"
                        style={{ color: net >= 0 ? "#0EA5A0" : "#B3261E" }}
                      >
                        {net >= 0 ? "+" : "-"}${Math.abs(net).toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
