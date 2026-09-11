"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DropdownPanel, useDropdownDismiss } from "@/components/ui/Dropdown";

export type ClientSearchResult = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
  client_type: string;
  primary_email?: string | null;
};

export function clientSearchResultLabel(c: ClientSearchResult) {
  if (c.client_type === "business" && c.business_name) return c.business_name;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed client";
}

/**
 * Debounced, workspace-scoped client name search with a dismissible results
 * dropdown -- the one implementation behind every "search for an existing
 * client, then show what got picked as a locked chip" field in the app.
 * Callers that let the user keep editing the query after picking (rather
 * than locking it behind a chip) don't fit this shape and keep their own
 * search logic.
 */
export function ClientSearchField({
  workspaceId,
  excludeClientId,
  selected,
  onSelect,
  placeholder = "Search clients by name...",
  autoFocus,
}: {
  workspaceId: string;
  excludeClientId?: string;
  selected: ClientSearchResult | null;
  onSelect: (client: ClientSearchResult | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const supabase = createClient();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientSearchResult[]>([]);
  const containerRef = useDropdownDismiss<HTMLDivElement>(results.length > 0, () => setResults([]));

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      let builder = supabase
        .from("clients")
        .select("id, first_name, last_name, business_name, client_type, primary_email")
        .eq("workspace_id", workspaceId)
        .is("merged_into_client_id", null);
      if (excludeClientId) builder = builder.neq("id", excludeClientId);
      const { data } = await builder
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,business_name.ilike.%${query}%`)
        .limit(8);
      setResults((data as ClientSearchResult[] | null) ?? []);
    }, 200);
    return () => clearTimeout(timeout);
  }, [query, workspaceId, excludeClientId, supabase]);

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-border bg-surfaceMuted px-3 py-2 text-sm">
        <span className="font-medium text-ink">{clientSearchResultLabel(selected)}</span>
        <button type="button" onClick={() => onSelect(null)} className="text-xs font-medium text-accent hover:underline">
          Change
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      {results.length > 0 && (
        <DropdownPanel className="left-0 mt-1 w-full">
          <ul>
            {results.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(c);
                    setQuery("");
                    setResults([]);
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-slate hover:bg-surfaceMuted"
                >
                  {clientSearchResultLabel(c)}
                </button>
              </li>
            ))}
          </ul>
        </DropdownPanel>
      )}
    </div>
  );
}
