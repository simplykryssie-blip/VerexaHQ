"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, Workflow, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { IconChip } from "@/components/ui/IconChip";

const STATUS_TONE: Record<string, BadgeTone> = { draft: "neutral", published: "success", archived: "neutral" };

export type FunnelCard = { id: string; name: string; status: string; page_count: number };

export function FunnelLibrary({
  workspaceId,
  websiteId,
  funnels,
  canManage,
}: {
  workspaceId: string;
  websiteId: string;
  funnels: FunnelCard[];
  canManage: boolean;
}) {
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
    const { data, error } = await supabase
      .from("site_funnels")
      .insert({ workspace_id: workspaceId, website_id: websiteId, name: trimmed })
      .select("id")
      .single();
    setSaving(false);
    if (error || !data) {
      setError(error?.message ?? "Could not create funnel.");
      return;
    }
    router.push(`/websites/${websiteId}/funnels/${data.id}`);
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
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} aria-hidden="true" /> New funnel
          </Button>
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
          <Button type="submit" disabled={saving}>
            {saving ? "Creating..." : "Create"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setCreating(false);
              setName("");
              setError(null);
            }}
          >
            Cancel
          </Button>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <div className="mt-4">
        {funnels.length === 0 ? (
          <EmptyState
            icon={Workflow}
            message="No funnels yet -- chain pages together into a linear sequence."
            action={canManage ? <Button onClick={() => setCreating(true)}><Plus size={14} aria-hidden="true" /> New funnel</Button> : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {funnels.map((f) => (
              <div
                key={f.id}
                className="flex flex-col rounded-2xl border border-border bg-surface p-4 shadow-soft transition hover:shadow-softHover"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <IconChip tone="amber">
                      <Workflow size={16} aria-hidden="true" />
                    </IconChip>
                    <h3 className="text-sm font-semibold text-ink">{f.name}</h3>
                  </div>
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
                <p className="mt-2 text-xs text-muted">
                  {f.page_count} page{f.page_count === 1 ? "" : "s"}
                </p>
                <div className="mt-3">
                  {canManage ? (
                    <TemplateStatusCycle table="site_funnels" id={f.id} status={f.status} />
                  ) : (
                    <Badge tone={STATUS_TONE[f.status] ?? "neutral"} className="capitalize">
                      {f.status}
                    </Badge>
                  )}
                </div>
                <Link href={`/websites/${websiteId}/funnels/${f.id}`} className={buttonClasses("secondary", "sm", "mt-4")}>
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
