"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, FileText, ExternalLink, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";
import { Button, buttonClasses } from "@/components/ui/Button";
import { IconChip } from "@/components/ui/IconChip";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { slugify } from "@/lib/slugify";
import { getLiveUrl } from "@/lib/websites/liveUrl";

export type SitePageCard = { id: string; title: string; slug: string; status: string };

const STATUS_TONE: Record<string, BadgeTone> = { draft: "neutral", published: "success", archived: "neutral" };

export function PageLibrary({
  workspaceId,
  workspaceSlug,
  websiteId,
  websiteSlug,
  customDomain,
  domainVerified,
  pages,
  canManage,
}: {
  workspaceId: string;
  workspaceSlug: string;
  websiteId: string;
  websiteSlug: string;
  customDomain: string | null;
  domainVerified: boolean;
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

  // "Live view" always lands on the site's home page -- the page whose slug
  // is literally "home" if one exists (the same convention the custom-domain
  // middleware rewrite relies on), else the first published page, so there's
  // always a sensible target without needing a dedicated "home page" flag.
  const homePage = pages.find((p) => p.slug === "home" && p.status === "published") ?? pages.find((p) => p.status === "published");
  const liveUrl = homePage ? getLiveUrl({ pageSlug: homePage.slug, workspaceSlug, websiteSlug, customDomain, domainVerified }) : null;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <Link href={`/websites/${websiteId}/funnels`} className="text-sm font-medium text-accent hover:underline">
          Manage funnels &rarr;
        </Link>
        <div className="flex items-center gap-2">
          {liveUrl && (
            <a href={liveUrl} target="_blank" rel="noreferrer" className={buttonClasses("secondary", "sm")}>
              <ExternalLink size={14} aria-hidden="true" /> Live view
            </a>
          )}
          {canManage && (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus size={14} aria-hidden="true" /> New page
            </Button>
          )}
        </div>
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
          <Button type="submit" size="md" disabled={saving}>
            {saving ? "Creating..." : "Create"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={() => {
              setCreating(false);
              setTitle("");
              setError(null);
            }}
          >
            Cancel
          </Button>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <div className="mt-4">
        {pages.length === 0 ? (
          <EmptyState
            icon={FileText}
            message="No pages yet -- create one to start building this site."
            action={canManage ? <Button onClick={() => setCreating(true)}><Plus size={14} aria-hidden="true" /> New page</Button> : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pages.map((p) => (
              <div
                key={p.id}
                className="flex flex-col rounded-2xl border border-border bg-surface p-4 shadow-soft transition hover:shadow-softHover"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <IconChip>
                      <FileText size={16} aria-hidden="true" />
                    </IconChip>
                    <h3 className="text-sm font-semibold text-ink">{p.title}</h3>
                  </div>
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
                <p className="mt-2 truncate text-xs text-muted">
                  /site/{workspaceSlug}/{websiteSlug}/{p.slug}
                </p>
                <div className="mt-3">
                  {canManage ? (
                    <TemplateStatusCycle table="site_pages" id={p.id} status={p.status} />
                  ) : (
                    <Badge tone={STATUS_TONE[p.status] ?? "neutral"} className="capitalize">
                      {p.status}
                    </Badge>
                  )}
                </div>
                <Link href={`/websites/${websiteId}/pages/${p.id}`} className={buttonClasses("secondary", "sm", "mt-4")}>
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
