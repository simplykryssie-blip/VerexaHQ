"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { BookkeepingEngagement, Client } from "@/lib/types";
import StatusPill from "@/components/StatusPill";
import EngagementModal from "@/components/EngagementModal";

type EngagementRow = BookkeepingEngagement & { clientName: string };

export default function BookkeepingPage() {
  const [rows, setRows] = useState<EngagementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("bookkeeping_engagements")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const list = (data as BookkeepingEngagement[]) ?? [];
    const clientIds = Array.from(new Set(list.map((e) => e.client_id)));
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

    setRows(list.map((e) => ({ ...e, clientName: clientsMap.get(e.client_id) ?? "—" })));
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
            Monthly Close
          </div>
          <h1 className="font-slab text-2xl font-bold text-ink">Bookkeeping</h1>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 bg-ink text-white text-sm font-semibold px-3.5 py-2 rounded-sm hover:bg-[#14273A] transition-colors"
        >
          <Plus size={15} /> New Engagement
        </button>
      </div>

      {showModal && (
        <EngagementModal onClose={() => setShowModal(false)} onSaved={load} />
      )}

      {error && (
        <div className="text-sm text-brick bg-brick/10 border border-brick/30 rounded-sm px-4 py-3 mb-4">
          {error}
        </div>
      )}

      <div className="bg-white border border-line rounded-sm divide-y divide-paperDim">
        {loading && <div className="px-5 py-6 text-sm text-muted">Loading engagements…</div>}
        {!loading && rows.length === 0 && (
          <div className="px-5 py-6 text-sm text-muted">
            No bookkeeping engagements yet. Click &quot;New Engagement&quot; to set up
            your first client.
          </div>
        )}
        {rows.map((e) => (
          <Link
            key={e.id}
            href={`/bookkeeping/${e.id}`}
            className="flex flex-col gap-2 px-5 py-3.5 hover:bg-paper transition-colors sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div className="font-semibold text-ink text-sm">{e.clientName}</div>
              <div className="text-xs text-muted mt-0.5">
                {e.bookkeeping_software || "No software set"} · {e.frequency ?? "monthly"}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:gap-4">
              {e.cleanup_needed && <StatusPill status="Needs Cleanup" />}
              <StatusPill status={e.engagement_status} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
