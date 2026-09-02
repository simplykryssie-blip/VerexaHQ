"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";
import { Badge } from "@/components/ui/Badge";

export type ServiceCategoryOption = { id: string; name: string };

export type ServiceCard = {
  id: string;
  name: string;
  status: string;
  category_name: string | null;
  pipeline_name: string | null;
};

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "service"
  );
}

const STATUS_FILTERS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

export function ServiceLibrary({
  workspaceId,
  services,
  categories,
  canManage,
  creating,
  onCreatingChange,
}: {
  workspaceId: string;
  services: ServiceCard[];
  categories: ServiceCategoryOption[];
  canManage: boolean;
  creating: boolean;
  onCreatingChange: (creating: boolean) => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      services.filter(
        (s) => (!query || s.name.toLowerCase().includes(query.toLowerCase())) && (status === "all" || s.status === status)
      ),
    [services, query, status]
  );

  async function createService(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    const base = slugify(trimmed);
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const { data, error: insertError } = await supabase
        .from("services")
        .insert({ workspace_id: workspaceId, name: trimmed, slug, service_category_id: categoryId || null, status: "draft" })
        .select("id")
        .single();
      if (!insertError && data) {
        setSaving(false);
        onCreatingChange(false);
        router.push(`/settings/services/${data.id}`);
        return;
      }
      if (insertError?.code !== "23505") {
        setSaving(false);
        setError(insertError?.message ?? "Could not create service.");
        return;
      }
    }
    setSaving(false);
    setError("Could not create service -- try a slightly different name.");
  }

  async function deleteService(id: string, serviceName: string) {
    if (!window.confirm(`Delete "${serviceName}"? This can't be undone.`)) return;
    setDeletingId(id);
    const { error: deleteError } = await supabase.from("services").delete().eq("id", id);
    setDeletingId(null);
    if (deleteError) {
      toast.show(deleteError.message, "error");
      return;
    }
    toast.show("Service deleted", "success");
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search services..."
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
      </div>

      <div className="mt-4">
        {filtered.length === 0 ? (
          <EmptyState message={services.length === 0 ? "No services yet -- create one to attach a pipeline, organizer, and requirements." : "No services match."} />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="divide-y divide-border">
              {filtered.map((s) => (
                <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{s.name}</p>
                    <p className="truncate text-xs text-muted">
                      {s.category_name ?? "No category"}
                      {s.pipeline_name ? ` · ${s.pipeline_name}` : " · No pipeline set"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {!s.pipeline_name && <Badge tone="warning">No pipeline</Badge>}
                    {canManage ? (
                      <TemplateStatusCycle table="services" id={s.id} status={s.status} />
                    ) : (
                      <Badge tone="neutral" className="capitalize">
                        {s.status}
                      </Badge>
                    )}
                    <Link href={`/settings/services/${s.id}`} className="text-xs font-medium text-accent hover:underline">
                      {canManage ? "Edit" : "View"}
                    </Link>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => deleteService(s.id, s.name)}
                        disabled={deletingId === s.id}
                        aria-label={`Delete ${s.name}`}
                        className="text-muted hover:text-danger disabled:opacity-60"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {creating && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 px-4 py-8">
          <form onSubmit={createService} className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-softHover">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-ink">New service</h2>
              <button type="button" onClick={() => onCreatingChange(false)} className="text-lg text-muted hover:text-ink">
                &times;
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-medium uppercase tracking-wide text-muted">
                Name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Tax Resolution"
                  required
                  autoFocus
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </label>
              <label className="block text-xs font-medium uppercase tracking-wide text-muted">
                Category (optional)
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="">No category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-muted">You&apos;ll set the pipeline, organizer, and other requirements after creating it.</p>
              {error && <p className="text-sm text-danger">{error}</p>}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => onCreatingChange(false)} className="rounded-lg px-3 py-1.5 text-sm text-slate hover:bg-surfaceMuted">
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
              >
                {saving ? "Creating..." : "Create & configure"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
