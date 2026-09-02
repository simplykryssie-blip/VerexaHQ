"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DropdownPanel, useDropdownDismiss } from "@/components/ui/Dropdown";

export type ClientOption = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
  client_type: string;
};

export function clientOptionLabel(c: ClientOption) {
  if (c.client_type === "business" && c.business_name) return c.business_name;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed client";
}

// Search-only existing-client picker -- unlike NewEngagementForm's client
// search, this never offers to create a new client: a quote or invoice is
// always for someone already in the system.
export function ClientPickerField({
  workspaceId,
  selected,
  onSelect,
}: {
  workspaceId: string;
  selected: ClientOption | null;
  onSelect: (client: ClientOption | null) => void;
}) {
  const supabase = createClient();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientOption[]>([]);
  const containerRef = useDropdownDismiss<HTMLDivElement>(results.length > 0, () => setResults([]));

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, first_name, last_name, business_name, client_type")
        .eq("workspace_id", workspaceId)
        .is("merged_into_client_id", null)
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,business_name.ilike.%${query}%`)
        .limit(8);
      setResults((data as ClientOption[]) ?? []);
    }, 200);
    return () => clearTimeout(timeout);
  }, [query, workspaceId, supabase]);

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-border bg-surfaceMuted px-3 py-2 text-sm">
        <span className="font-medium text-ink">{clientOptionLabel(selected)}</span>
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
        placeholder="Search clients by name..."
        autoFocus
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
                  {clientOptionLabel(c)}
                </button>
              </li>
            ))}
          </ul>
        </DropdownPanel>
      )}
    </div>
  );
}
