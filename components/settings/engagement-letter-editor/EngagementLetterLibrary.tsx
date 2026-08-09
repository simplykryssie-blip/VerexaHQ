"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/EmptyState";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";

export type EngagementLetterCard = {
  id: string;
  name: string;
  status: string;
  workspace_id: string | null;
  requires_signature: boolean;
  merge_field_count: number;
};

const STATUS_FILTERS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

export function EngagementLetterLibrary({ workspaceId, templates }: { workspaceId: string; templates: EngagementLetterCard[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(
    () => templates.filter((t) => (!query || t.name.toLowerCase().includes(query.toLowerCase())) && (status === "all" || t.status === status)),
    [templates, query, status]
  );

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const { data, error } = await supabase
      .from("engagement_letter_templates")
      .insert({ workspace_id: workspaceId, name, slug, body_html: "<p></p>", status: "draft" })
      .select("id")
      .single();
    setSaving(false);
    if (error || !data) {
      setError(error?.message ?? "Could not create engagement letter.");
      return;
    }
    router.push(`/settings/templates/engagement-letters/${data.id}`);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search engagement letters..."
          className="w-64 rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="ml-auto rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90"
        >
          + New engagement letter
        </button>
      </div>

      <div className="mt-4">
        {filtered.length === 0 ? (
          <EmptyState message="No engagement letters match." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((t) => (
              <div key={t.id} className="flex flex-col rounded-xl border border-border bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-ink">{t.name}</h3>
                  {!t.workspace_id && <span className="rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-medium text-muted">System</span>}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {t.workspace_id ? (
                    <TemplateStatusCycle table="engagement_letter_templates" id={t.id} status={t.status} />
                  ) : (
                    <span className="rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-medium capitalize text-muted">{t.status}</span>
                  )}
                  {t.requires_signature && (
                    <span className="rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-medium text-muted">Requires signature</span>
                  )}
                  <span className="rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-medium text-muted">
                    {t.merge_field_count} merge field{t.merge_field_count === 1 ? "" : "s"}
                  </span>
                </div>
                <Link
                  href={`/settings/templates/engagement-letters/${t.id}`}
                  className="mt-4 inline-flex items-center justify-center rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-ink"
                >
                  {t.workspace_id ? "Edit" : "View"}
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {creating && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4">
          <form onSubmit={createTemplate} className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">New engagement letter</h2>
              <button type="button" onClick={() => setCreating(false)} className="text-lg text-muted hover:text-ink">
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                required
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="Slug (unique key)"
                required
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              {error && <p className="text-sm text-danger">{error}</p>}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setCreating(false)} className="rounded-lg px-3 py-1.5 text-sm text-slate hover:bg-surfaceMuted">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
              >
                {saving ? "Creating..." : "Create & open editor"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
