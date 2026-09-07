"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, Bell, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { IconChip } from "@/components/ui/IconChip";

const STATUS_TONE: Record<string, BadgeTone> = { draft: "neutral", published: "success", archived: "neutral" };

const TRIGGER_LABEL: Record<string, string> = {
  on_load: "On page load",
  after_delay: "After a delay",
  exit_intent: "Exit intent",
  scroll_percent: "On scroll",
};

export type PopupCard = { id: string; name: string; status: string; trigger_type: string };

export function PopupLibrary({
  workspaceId,
  websiteId,
  popups,
  canManage,
}: {
  workspaceId: string;
  websiteId: string;
  popups: PopupCard[];
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

  async function createPopup(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("A popup name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    const { data, error } = await supabase
      .from("site_popups")
      .insert({ workspace_id: workspaceId, website_id: websiteId, name: trimmed })
      .select("id")
      .single();
    setSaving(false);
    if (error || !data) {
      setError(error?.message ?? "Could not create popup.");
      return;
    }
    router.push(`/websites/${websiteId}/popups/${data.id}`);
  }

  async function deletePopup(id: string) {
    if (!confirm("Delete this popup? This can't be undone.")) return;
    setDeletingId(id);
    const { error } = await supabase.from("site_popups").delete().eq("id", id);
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
            <Plus size={14} aria-hidden="true" /> New popup
          </Button>
        </div>
      )}

      {creating && (
        <form onSubmit={createPopup} className="mt-4 flex items-end gap-2 rounded-2xl border border-border bg-surface p-4 shadow-soft">
          <label className="flex-1 text-xs font-medium uppercase tracking-wide text-muted">
            Popup name
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Free Consultation Offer"
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
        {popups.length === 0 ? (
          <EmptyState
            icon={Bell}
            message="No popups yet -- add one for lead capture, an announcement, or a limited-time offer."
            action={canManage ? <Button onClick={() => setCreating(true)}><Plus size={14} aria-hidden="true" /> New popup</Button> : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {popups.map((p) => (
              <div
                key={p.id}
                className="flex flex-col rounded-2xl border border-border bg-surface p-4 shadow-soft transition hover:shadow-softHover"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <IconChip tone="violet">
                      <Bell size={16} aria-hidden="true" />
                    </IconChip>
                    <h3 className="text-sm font-semibold text-ink">{p.name}</h3>
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => deletePopup(p.id)}
                      disabled={deletingId === p.id}
                      className="shrink-0 rounded p-1 text-muted hover:text-danger disabled:opacity-60"
                      aria-label="Delete popup"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted">{TRIGGER_LABEL[p.trigger_type] ?? p.trigger_type}</p>
                <div className="mt-3">
                  {canManage ? (
                    <TemplateStatusCycle table="site_popups" id={p.id} status={p.status} />
                  ) : (
                    <Badge tone={STATUS_TONE[p.status] ?? "neutral"} className="capitalize">
                      {p.status}
                    </Badge>
                  )}
                </div>
                <Link href={`/websites/${websiteId}/popups/${p.id}`} className={buttonClasses("secondary", "sm", "mt-4")}>
                  {canManage ? "Edit" : "View"}
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
