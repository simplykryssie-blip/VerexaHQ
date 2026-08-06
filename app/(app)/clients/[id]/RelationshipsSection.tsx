"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/EmptyState";
import type { RelationshipRow } from "./ClientWorkspaceTabs";

const RELATIONSHIP_TYPES = ["spouse", "dependent", "parent", "child", "business", "trust", "estate", "partner", "owner", "officer", "other"];

type ClientSearchResult = { id: string; label: string };

function RevealRelationshipSsn({ relationshipId, last4 }: { relationshipId: string; last4: string | null }) {
  const supabase = createClient();
  const [value, setValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!last4) return null;

  async function reveal() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc("reveal_client_relationship_ssn", { p_relationship_id: relationshipId });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setValue(data);
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono">{value ?? `SSN ••• •• ${last4}`}</span>
      <button type="button" disabled={loading} onClick={() => (value ? setValue(null) : reveal())} className="text-accent hover:underline disabled:opacity-60">
        {loading ? "..." : value ? "Hide" : "Reveal"}
      </button>
      {error && <span className="text-danger">{error}</span>}
    </span>
  );
}

export function AddRelationshipForm({ clientId, workspaceId }: { clientId: string; workspaceId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [relationshipType, setRelationshipType] = useState(RELATIONSHIP_TYPES[0]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientSearchResult[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientSearchResult | null>(null);
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [ssn, setSsn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function search(q: string) {
    setQuery(q);
    setSelectedClient(null);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const { data } = await supabase
      .from("clients")
      .select("id, client_type, first_name, last_name, business_name")
      .eq("workspace_id", workspaceId)
      .neq("id", clientId)
      .is("merged_into_client_id", null)
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,business_name.ilike.%${q}%`)
      .limit(6);
    setResults(
      (data ?? []).map((c) => ({
        id: c.id,
        label: c.client_type === "business" && c.business_name ? c.business_name : [c.first_name, c.last_name].filter(Boolean).join(" "),
      }))
    );
  }

  function pick(result: ClientSearchResult) {
    setSelectedClient(result);
    setName(result.label);
    setQuery(result.label);
    setResults([]);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const finalName = selectedClient ? selectedClient.label : name.trim();
    if (!finalName) {
      setError("Enter a name or pick an existing client.");
      return;
    }
    setSaving(true);
    const { error: rpcError } = await supabase.rpc("create_client_relationship", {
      p_client_id: clientId,
      p_workspace_id: workspaceId,
      p_relationship_type: relationshipType,
      p_related_name: finalName,
      p_related_client_id: selectedClient?.id ?? undefined,
      p_related_dob: dob || undefined,
      p_related_ssn: ssn || undefined,
    });
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setOpen(false);
    setQuery("");
    setName("");
    setDob("");
    setSsn("");
    setSelectedClient(null);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-accent hover:underline">
        + Add Relationship
      </button>
    );
  }

  return (
    <form onSubmit={create} className="mt-2 space-y-2 rounded-lg border border-border bg-surfaceMuted p-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Type
          <select
            value={relationshipType}
            onChange={(e) => setRelationshipType(e.target.value)}
            className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {RELATIONSHIP_TYPES.map((t) => (
              <option key={t} value={t}>
                {t[0].toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="relative flex flex-col gap-1 text-xs text-muted">
          Name (search clients or type new)
          <input
            value={selectedClient ? selectedClient.label : query}
            onChange={(e) => {
              if (selectedClient) return;
              search(e.target.value);
              setName(e.target.value);
            }}
            disabled={Boolean(selectedClient)}
            placeholder="Start typing..."
            className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-surface"
          />
          {selectedClient && (
            <button type="button" onClick={() => { setSelectedClient(null); setQuery(""); setName(""); }} className="absolute right-1.5 top-6 text-xs text-accent hover:underline">
              Clear
            </button>
          )}
          {results.length > 0 && (
            <ul className="absolute top-full z-10 mt-1 w-full rounded-lg border border-border bg-surface shadow-sm">
              {results.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => pick(r)} className="block w-full px-2 py-1.5 text-left text-sm text-slate hover:bg-surfaceMuted">
                    {r.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Date of birth (optional)
          <input
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          SSN (optional)
          <input
            value={ssn}
            onChange={(e) => setSsn(e.target.value)}
            className="rounded-lg border border-border px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </label>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate hover:bg-surface">
          Cancel
        </button>
        <button type="submit" disabled={saving} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60">
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}

export function RelationshipsList({ relationships }: { relationships: RelationshipRow[] }) {
  if (relationships.length === 0) return <EmptyState message="No relationships recorded." />;
  return (
    <ul className="divide-y divide-border">
      {relationships.map((r) => (
        <li key={r.id} className="py-2 text-sm text-slate">
          <span className="mr-2 capitalize text-muted">{r.relationship_type}:</span>
          {r.related_client_id ? (
            <a href={`/clients/${r.related_client_id}`} className="text-accent hover:underline">
              {r.related_name}
            </a>
          ) : (
            r.related_name
          )}
          {r.related_dob && <span className="ml-2 text-xs text-muted">DOB {new Date(r.related_dob).toLocaleDateString()}</span>}
          {r.related_ssn_last4 && (
            <span className="ml-2 text-xs text-muted">
              <RevealRelationshipSsn relationshipId={r.id} last4={r.related_ssn_last4} />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
