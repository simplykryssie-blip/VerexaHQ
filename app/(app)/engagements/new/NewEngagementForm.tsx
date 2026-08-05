"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ClientOption = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
  client_type: string;
};

function clientLabel(c: ClientOption) {
  if (c.client_type === "business" && c.business_name) return c.business_name;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed client";
}

export function NewEngagementForm({
  workspaceId,
  clients,
  engagementTypes,
  defaultClientId,
}: {
  workspaceId: string;
  clients: ClientOption[];
  engagementTypes: { id: string; name: string }[];
  defaultClientId?: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const [engagementTypeId, setEngagementTypeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!clientId) {
      setError("Select a client.");
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from("engagements")
      .insert({
        workspace_id: workspaceId,
        client_id: clientId,
        engagement_type_id: engagementTypeId || null,
        due_date: dueDate || null,
      })
      .select("id")
      .single();

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push(`/engagements/${data.id}`);
    router.refresh();
  }

  if (clients.length === 0) {
    return (
      <p className="text-sm text-muted">
        You need at least one client before you can create an engagement.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate">Client</label>
        <select
          required
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="" disabled>
            Select a client
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {clientLabel(c)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate">Engagement type</label>
        <select
          value={engagementTypeId}
          onChange={(e) => setEngagementTypeId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="">Not set</option>
          {engagementTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate">Due date</label>
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg px-4 py-2 text-sm font-medium text-slate hover:bg-surfaceMuted"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
        >
          {loading ? "Creating..." : "Create engagement"}
        </button>
      </div>
    </form>
  );
}
