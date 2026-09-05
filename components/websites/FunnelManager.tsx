"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronUp, ChevronDown, X, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

const STATUS_TONE: Record<string, BadgeTone> = { draft: "neutral", published: "success", archived: "neutral" };

type MemberPage = { id: string; title: string; slug: string; status: string; funnel_position: number | null };
type AvailablePage = { id: string; title: string; slug: string };
type Funnel = { id: string; workspace_id: string; website_id: string; name: string; status: string };

function slugify(title: string) {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "page"
  );
}

export function FunnelManager({
  funnel,
  memberPages,
  availablePages,
  canManage,
}: {
  funnel: Funnel;
  memberPages: MemberPage[];
  availablePages: AvailablePage[];
  canManage: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [name, setName] = useState(funnel.name);
  const [pages, setPages] = useState(memberPages);
  const [available, setAvailable] = useState(availablePages);
  const [addingId, setAddingId] = useState("");
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  async function commitName() {
    const trimmed = name.trim() || funnel.name;
    setName(trimmed);
    if (trimmed === funnel.name) return;
    const { error } = await supabase.from("site_funnels").update({ name: trimmed }).eq("id", funnel.id);
    if (error) toast.show(error.message, "error");
  }

  async function move(id: string, direction: "up" | "down") {
    const index = pages.findIndex((p) => p.id === id);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= pages.length) return;
    const reordered = [...pages];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    setPages(reordered);
    const { error } = await supabase.rpc("reorder_funnel_pages", { p_funnel_id: funnel.id, p_page_ids: reordered.map((p) => p.id) });
    if (error) toast.show(error.message, "error");
  }

  async function removeFromFunnel(id: string) {
    const remaining = pages.filter((p) => p.id !== id);
    const removed = pages.find((p) => p.id === id);
    setPages(remaining);
    if (removed) setAvailable((prev) => [...prev, { id: removed.id, title: removed.title, slug: removed.slug }]);

    const { error } = await supabase.from("site_pages").update({ funnel_id: null, funnel_position: null }).eq("id", id);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    if (remaining.length > 0) {
      await supabase.rpc("reorder_funnel_pages", { p_funnel_id: funnel.id, p_page_ids: remaining.map((p) => p.id) });
    }
  }

  async function addExisting() {
    if (!addingId) return;
    const page = available.find((p) => p.id === addingId);
    if (!page) return;
    const { error } = await supabase.from("site_pages").update({ funnel_id: funnel.id, funnel_position: pages.length }).eq("id", addingId);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setPages((prev) => [...prev, { id: page.id, title: page.title, slug: page.slug, status: "draft", funnel_position: prev.length }]);
    setAvailable((prev) => prev.filter((p) => p.id !== addingId));
    setAddingId("");
    router.refresh();
  }

  async function createNewPage(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    const { data, error } = await supabase
      .from("site_pages")
      .insert({
        workspace_id: funnel.workspace_id,
        website_id: funnel.website_id,
        title: trimmed,
        slug: slugify(trimmed),
        funnel_id: funnel.id,
        funnel_position: pages.length,
      })
      .select("id")
      .single();
    if (error || !data) {
      toast.show(error?.message ?? "Could not create page.", "error");
      return;
    }
    router.push(`/websites/${funnel.website_id}/pages/${data.id}`);
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-soft">
        {canManage ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            className="flex-1 rounded-lg border border-transparent px-2 py-1 text-sm font-semibold text-ink hover:border-border focus:border-accent focus:outline-none"
          />
        ) : (
          <p className="flex-1 text-sm font-semibold text-ink">{name}</p>
        )}
        {canManage ? (
          <TemplateStatusCycle table="site_funnels" id={funnel.id} status={funnel.status} />
        ) : (
          <Badge tone={STATUS_TONE[funnel.status] ?? "neutral"} className="capitalize">
            {funnel.status}
          </Badge>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {pages.length === 0 && <p className="text-sm text-muted">No pages in this funnel yet.</p>}
        {pages.map((p, i) => (
          <div key={p.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
            <span className="w-5 shrink-0 text-center text-xs font-semibold text-muted">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{p.title}</p>
              <p className="truncate text-xs text-muted">/{p.slug}</p>
            </div>
            <Badge tone={STATUS_TONE[p.status] ?? "neutral"} className="shrink-0 capitalize">
              {p.status}
            </Badge>
            {canManage && (
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" onClick={() => move(p.id, "up")} disabled={i === 0} className="rounded p-1 text-muted hover:text-ink disabled:opacity-30" aria-label="Move up">
                  <ChevronUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => move(p.id, "down")}
                  disabled={i === pages.length - 1}
                  className="rounded p-1 text-muted hover:text-ink disabled:opacity-30"
                  aria-label="Move down"
                >
                  <ChevronDown size={14} />
                </button>
                <Link
                  href={`/websites/${funnel.website_id}/pages/${p.id}`}
                  className="rounded-lg border border-border px-2 py-1 text-xs font-medium text-slate hover:border-accent hover:text-ink"
                >
                  Edit
                </Link>
                <button type="button" onClick={() => removeFromFunnel(p.id)} className="rounded p-1 text-muted hover:text-danger" aria-label="Remove from funnel">
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {canManage && (
        <div className="mt-6 space-y-3 rounded-2xl border border-dashed border-border p-4">
          {available.length > 0 && (
            <div className="flex items-end gap-2">
              <label className="flex-1 text-xs font-medium uppercase tracking-wide text-muted">
                Add an existing page
                <select
                  value={addingId}
                  onChange={(e) => setAddingId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="">Choose a page...</option>
                  {available.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={addExisting} disabled={!addingId} className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-slate hover:border-accent hover:text-ink disabled:opacity-60">
                Add
              </button>
            </div>
          )}

          {creating ? (
            <form onSubmit={createNewPage} className="flex items-end gap-2">
              <label className="flex-1 text-xs font-medium uppercase tracking-wide text-muted">
                New page title
                <input
                  autoFocus
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </label>
              <button type="submit" className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90">
                Create
              </button>
              <button type="button" onClick={() => setCreating(false)} className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-slate hover:border-accent hover:text-ink">
                Cancel
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
            >
              <Plus size={13} /> Create a new page in this funnel
            </button>
          )}
        </div>
      )}
    </div>
  );
}
