"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, ChevronRight, Pencil, Users, UserCheck, UserPlus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Client } from "@/lib/types";
import { clientDisplayName, clientInitials, accountTypeMeta } from "@/lib/clientDisplay";
import StatusPill from "@/components/StatusPill";
import ClientModal from "@/components/ClientModal";

import { friendlyError } from "@/lib/friendlyError";
const STATUS_FILTERS = ["all", "lead", "active", "inactive", "archived"];

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      setError(friendlyError(error, "Something went wrong. Please try again."));
    } else {
      setClients((data as Client[]) ?? []);
      setError(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("new") === "1") {
      setShowNewModal(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const stats = useMemo(
    () => ({
      total: clients.length,
      active: clients.filter((c) => c.status === "active").length,
      leads: clients.filter((c) => c.status === "lead").length,
    }),
    [clients]
  );

  const filtered = clients.filter((c) => {
    const matchesQuery = clientDisplayName(c).toLowerCase().includes(query.toLowerCase());
    // "All" means all non-archived clients — archived records only ever
    // show up under the explicit Archived filter, never under All or any
    // other status tab.
    const matchesStatus = statusFilter === "all" ? c.status !== "archived" : c.status === statusFilter;
    return matchesQuery && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Book of Business
          </div>
          <h1 className="font-slab text-2xl font-bold text-ink">Clients</h1>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-1.5 bg-[#108A64] text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-[#0d7555] transition-colors"
        >
          <Plus size={16} /> New Client
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric icon={Users} label="Total clients" value={loading ? "—" : stats.total.toLocaleString()} />
        <Metric icon={UserCheck} label="Active" value={loading ? "—" : stats.active.toLocaleString()} />
        <Metric icon={UserPlus} label="Leads" value={loading ? "—" : stats.leads.toLocaleString()} />
      </div>

      <div className="app-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2.5">
            <Search size={16} className="text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search clients…"
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-xl px-3 py-2 text-xs font-semibold capitalize transition-colors ${
                  statusFilter === s
                    ? "bg-[#108A64] text-white"
                    : "border border-line text-muted hover:text-ink"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      <div className="app-card overflow-hidden">
        {loading && <div className="px-5 py-8 text-sm text-muted">Loading clients…</div>}
        {!loading && filtered.length === 0 && (
          <div className="mx-4 my-4 rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">
            {clients.length === 0
              ? 'No clients yet. Click "New Client" to add your first one.'
              : "No clients match your search."}
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <div className="divide-y divide-line">
            {filtered.map((c) => {
              const meta = accountTypeMeta(c);
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-paper"
                >
                  <Link href={`/clients/${c.id}`} className="flex flex-1 items-center gap-3.5 min-w-0">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-sm font-bold text-[#108A64]">
                      {clientInitials(c)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-ink">{clientDisplayName(c)}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                        <span className={`rounded-full px-2 py-0.5 font-semibold ${meta.badge}`}>{meta.label}</span>
                        {c.email && <span className="truncate">{c.email}</span>}
                      </div>
                    </div>
                  </Link>
                  <div className="hidden text-sm text-muted md:block">{c.phone || "—"}</div>
                  <StatusPill status={c.status} />
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setEditingClient(c)}
                      className="text-muted hover:text-ink"
                      aria-label="Edit client"
                    >
                      <Pencil size={14} />
                    </button>
                    <Link href={`/clients/${c.id}`}>
                      <ChevronRight size={16} className="text-muted" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showNewModal && (
        <ClientModal onClose={() => setShowNewModal(false)} onSaved={load} />
      )}
      {editingClient && (
        <ClientModal
          client={editingClient}
          onClose={() => setEditingClient(null)}
          onSaved={load}
          onDeleted={load}
        />
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="app-card p-5">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-[#108A64]">
        <Icon size={19} />
      </div>
      <div className="mt-4 text-2xl font-bold tabular-nums text-ink">{value}</div>
      <div className="mt-1 text-sm text-muted">{label}</div>
    </div>
  );
}
