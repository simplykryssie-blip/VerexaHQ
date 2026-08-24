"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";

export type FunnelCard = { id: string; name: string; status: string; page_count: number };

export function FunnelLibrary({ workspaceId, funnels, canManage }: { workspaceId: string; funnels: FunnelCard[]; canManage: boolean }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function createFunnel(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("A funnel name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    const { data, error } = await supabase.from("site_funnels").insert({ workspace_id: workspaceId, name: trimmed }).select("id").single();
    setSaving(false);
    if (error || !data) {
      setError(error?.message ?? "Could not create funnel.");
      return;
    }
    router.push(`/pages/funnels/${data.id}`);
  }

  async function deleteFunnel(id: string) {
    if (!confirm("Delete this funnel? Its pages will become standalone pages, not deleted.")) return;
    setDeletingId(id);
    const { error } = await supabase.from("site_funnels").delete().eq("id", id);
    setDeletingId(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      {canManage && (
        <div className="flex justify-end">
          <button type="button" onClick={() => setCreating(true)} className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90">
            + New funnel
          </button>
        </div>
      )}

      {creating && (
        <form onSubmit={createFunnel} className="mt-4 flex items-end gap-2 rounded-2xl border border-border bg-surface p-4 shadow-soft">
          <label className="flex-1 text-xs font-medium uppercase tracking-wide text-muted">
            Funnel name
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Free Consultation Funnel"
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </label>
          <button type="submit" disabled={saving} className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
            {saving ? "Creating..." : "Create"}
          </button>
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              setName("");
              setError(null);
            }}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-slate hover:border-accent hover:text-ink"
          >
            Cancel
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <div className="mt-4">
        {funnels.length === 0 ? (
          <EmptyState message="No funnels yet." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {funnels.map((f) => (
              <div key={f.id} className="flex flex-col rounded-2xl border border-border bg-surface p-4 shadow-soft">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-ink">{f.name}</h3>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => deleteFunnel(f.id)}
                      disabled={deletingId === f.id}
                      className="shrink-0 rounded p-1 text-muted hover:text-danger disabled:opacity-60"
                      aria-label="Delete funnel"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted">
                  {f.page_count} page{f.page_count === 1 ? "" : "s"}
                </p>
                <div className="mt-3">
                  {canManage ? (
                    <TemplateStatusCycle table="site_funnels" id={f.id} status={f.status} />
                  ) : (
                    <span className="rounded-full bg-surfaceMuted px-2.5 py-1 text-xs font-medium capitalize text-muted">{f.status}</span>
                  )}
                </div>
                <Link
                  href={`/pages/funnels/${f.id}`}
                  className="mt-4 inline-flex items-center justify-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-ink"
                >
                  {canManage ? "Manage" : "View"}
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
