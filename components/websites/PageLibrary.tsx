"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";

export type SitePageCard = { id: string; title: string; slug: string; status: string };

function slugify(title: string) {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "page"
  );
}

export function PageLibrary({
  workspaceId,
  workspaceSlug,
  websiteId,
  websiteSlug,
  pages,
  canManage,
}: {
  workspaceId: string;
  workspaceSlug: string;
  websiteId: string;
  websiteSlug: string;
  pages: SitePageCard[];
  canManage: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function createPage(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const trimmed = title.trim();
    if (!trimmed) {
      setSaving(false);
      setError("A page title is required.");
      return;
    }
    const { data, error } = await supabase
      .from("site_pages")
      .insert({ workspace_id: workspaceId, website_id: websiteId, title: trimmed, slug: slugify(trimmed) })
      .select("id")
      .single();
    setSaving(false);
    if (error || !data) {
      setError(error?.message ?? "Could not create page.");
      return;
    }
    router.push(`/websites/${websiteId}/pages/${data.id}`);
  }

  async function deletePage(id: string) {
    if (!confirm("Delete this page? This can't be undone.")) return;
    setDeletingId(id);
    const { error } = await supabase.from("site_pages").delete().eq("id", id);
    setDeletingId(null);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <Link href={`/websites/${websiteId}/funnels`} className="text-sm font-medium text-accent hover:underline">
          Manage funnels &rarr;
        </Link>
        {canManage && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90"
          >
            + New page
          </button>
        )}
      </div>

      {creating && (
        <form onSubmit={createPage} className="mt-4 flex items-end gap-2 rounded-2xl border border-border bg-surface p-4 shadow-soft">
          <label className="flex-1 text-xs font-medium uppercase tracking-wide text-muted">
            Page title
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Free Consultation"
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
              setTitle("");
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
        {pages.length === 0 ? (
          <EmptyState message="No pages yet -- create one to start building this site." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pages.map((p) => (
              <div key={p.id} className="flex flex-col rounded-2xl border border-border bg-surface p-4 shadow-soft">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-ink">{p.title}</h3>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => deletePage(p.id)}
                      disabled={deletingId === p.id}
                      className="shrink-0 rounded p-1 text-muted hover:text-danger disabled:opacity-60"
                      aria-label="Delete page"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-muted">
                  /site/{workspaceSlug}/{websiteSlug}/{p.slug}
                </p>
                <div className="mt-3">
                  {canManage ? (
                    <TemplateStatusCycle table="site_pages" id={p.id} status={p.status} />
                  ) : (
                    <span className="rounded-full bg-surfaceMuted px-2.5 py-1 text-xs font-medium capitalize text-muted">{p.status}</span>
                  )}
                </div>
                <Link
                  href={`/websites/${websiteId}/pages/${p.id}`}
                  className="mt-4 inline-flex items-center justify-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-ink"
                >
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
