"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DropdownPanel, useDropdownDismiss } from "@/components/ui/Dropdown";

type Result = { id: string; label: string; sub: string };

export function GlobalSearch({ workspaceId }: { workspaceId: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useDropdownDismiss<HTMLDivElement>(open, () => setOpen(false));

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
        .select("id, first_name, last_name, business_name, client_type")
        .eq("workspace_id", workspaceId)
        .is("merged_into_client_id", null)
        .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,business_name.ilike.%${q}%`)
        .limit(8);
      setResults(
        (data ?? []).map((c) => ({
          id: c.id,
          label: c.business_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed client",
          sub: c.client_type === "business" ? "Business" : "Individual",
        }))
      );
      setLoading(false);
    }, 250);
    return () => clearTimeout(timeout);
  }, [query, supabase, workspaceId]);

  function goToClient(id: string) {
    setOpen(false);
    setQuery("");
    router.push(`/clients/${id}`);
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-xs">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surfaceMuted px-3 py-1.5 focus-within:border-accent">
        <Search size={14} className="shrink-0 text-muted" aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search clients…"
          aria-label="Search clients"
          className="w-full bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="shrink-0 text-muted hover:text-ink">
            <X size={14} />
          </button>
        )}
      </div>

      {open && query.trim().length >= 2 && (
        <DropdownPanel className="left-0 top-full mt-1 w-full">
          {loading ? (
            <p className="px-3 py-3 text-sm text-muted">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-muted">No clients found.</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => goToClient(r.id)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surfaceMuted"
                  >
                    <span className="truncate text-ink">{r.label}</span>
                    <span className="shrink-0 text-xs text-muted">{r.sub}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DropdownPanel>
      )}
    </div>
  );
}
