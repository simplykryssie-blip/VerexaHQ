"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/Modal";

type Result = { id: string; label: string };

/**
 * "Create Invoice" and "Request Documents" both need a client first -- there's no
 * client-agnostic version of either. This picks one and lands you directly on the tab
 * that action lives on, instead of dumping you on the full Contacts list to go find it.
 */
export function QuickActionClientPicker({
  workspaceId,
  title,
  destinationTab,
  onClose,
}: {
  workspaceId: string;
  title: string;
  destinationTab: "Billing" | "Documents";
  onClose: () => void;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, first_name, last_name, business_name")
        .eq("workspace_id", workspaceId)
        .is("merged_into_client_id", null)
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,business_name.ilike.%${q}%`)
        .limit(8);
      setResults((data ?? []).map((c) => ({ id: c.id, label: c.business_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed client" })));
      setLoading(false);
    }, 250);
    return () => clearTimeout(timeout);
  }, [query, supabase, workspaceId]);

  function go(id: string) {
    router.push(`/clients/${id}?tab=${destinationTab}`);
    onClose();
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 focus-within:border-accent">
        <Search size={14} className="shrink-0 text-muted" aria-hidden="true" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clients by name..."
          className="w-full bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
        />
      </div>
      <div className="mt-2">
        {loading ? (
          <p className="px-1 py-3 text-sm text-muted">Searching...</p>
        ) : query.trim().length >= 2 && results.length === 0 ? (
          <p className="px-1 py-3 text-sm text-muted">No clients found.</p>
        ) : (
          <ul className="max-h-64 divide-y divide-border overflow-y-auto">
            {results.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => go(r.id)} className="block w-full px-1 py-2.5 text-left text-sm text-ink hover:text-accent">
                  {r.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
