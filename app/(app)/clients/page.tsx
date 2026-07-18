"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Search, ChevronRight, Building2, User, Pencil } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Client } from "@/lib/types";
import StatusPill from "@/components/StatusPill";
import ClientModal from "@/components/ClientModal";

function clientDisplayName(c: Client) {
  return c.client_type === "business" && c.business_name
    ? c.business_name
    : `${c.first_name} ${c.last_name}`.trim();
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [query, setQuery] = useState("");
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
      setError(error.message);
    } else {
      setClients((data as Client[]) ?? []);
      setError(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = clients.filter((c) =>
    clientDisplayName(c).toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-end justify-between mb-4 border-b border-line pb-3">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted font-semibold mb-1">
            Book of Business
          </div>
          <h1 className="font-slab text-2xl font-bold text-ink">Clients</h1>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-1.5 bg-ink text-white text-sm font-semibold px-3.5 py-2 rounded-sm hover:bg-[#14273A] transition-colors"
        >
          <Plus size={15} /> New Client
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4 bg-white border border-line rounded-sm px-3 py-2">
        <Search size={15} className="text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clients…"
          className="flex-1 text-sm outline-none"
        />
      </div>

      {error && (
        <div className="text-sm text-brick bg-brick/10 border border-brick/30 rounded-sm px-4 py-3 mb-4">
          {error}
        </div>
      )}

      <div className="bg-white border border-line rounded-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-widest text-muted">
              <th className="px-5 py-3 font-semibold">Client</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold">Email</th>
              <th className="px-5 py-3 font-semibold">Phone</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paperDim">
            {loading && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-muted">
                  Loading clients…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-muted">
                  No clients yet. Click &quot;New Client&quot; to add your first one.
                </td>
              </tr>
            )}
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-paper transition-colors">
                <td className="px-5 py-4">
                  <Link href={`/clients/${c.id}`} className="flex items-center gap-2.5">
                    {c.client_type === "business" ? (
                      <Building2 size={15} className="text-muted" />
                    ) : (
                      <User size={15} className="text-muted" />
                    )}
                    <span className="font-semibold text-ink">
                      {clientDisplayName(c)}
                    </span>
                  </Link>
                </td>
                <td className="px-5 py-4">
                  <StatusPill status={c.status} />
                </td>
                <td className="px-5 py-4 text-[#3E4A5B]">{c.email}</td>
                <td className="px-5 py-4 text-[#3E4A5B]">{c.phone}</td>
                <td className="px-5 py-4 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <button
                      onClick={() => setEditingClient(c)}
                      className="text-muted hover:text-ink"
                      aria-label="Edit client"
                    >
                      <Pencil size={14} />
                    </button>
                    <Link href={`/clients/${c.id}`}>
                      <ChevronRight size={16} className="text-muted inline" />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
