"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, X, Check } from "lucide-react";
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
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);

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

  function slugifyCategory(name: string) {
    return (
      name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || "category"
    );
  }

  function beginEditCategory(category: ServiceCategoryOption) {
    setEditingCategoryId(category.id);
    setCategoryName(category.name);
  }

  function cancelEditCategory() {
    setEditingCategoryId(null);
    setCategoryName("");
  }

  async function saveCategory() {
    const trimmed = categoryName.trim();
    if (!trimmed || !editingCategoryId) return;
    setSavingCategory(true);
    const { error: updateError } = await supabase
      .from("service_categories")
      .update({ name: trimmed })
      .eq("id", editingCategoryId)
      .eq("workspace_id", workspaceId);
    setSavingCategory(false);
    if (updateError) {
      toast.show(updateError.message, "error");
      return;
    }
    toast.show("Category updated", "success");
    cancelEditCategory();
    router.refresh();
  }

  async function deleteCategory(category: ServiceCategoryOption) {
    const { count: serviceCount } = await supabase
      .from("services")
      .select("id", { count: "exact", head: true })
      .eq("service_category_id", category.id)
      .eq("workspace_id", workspaceId);

    if (!window.confirm(
      (serviceCount ?? 0) > 0
        ? `Delete "${category.name}"? ${serviceCount} service(s) will become Uncategorized. This can't be undone.`
        : `Delete "${category.name}"? This can't be undone.`
    )) return;

    setDeletingCategoryId(category.id);
    const { error: deleteError } = await supabase
      .from("service_categories")
      .delete()
      .eq("id", category.id)
      .eq("workspace_id", workspaceId);
    setDeletingCategoryId(null);
    if (deleteError) {
      toast.show(deleteError.message, "error");
      return;
    }
    toast.show("Category deleted", "success");
    router.refresh();
  }

  async function deleteService(id: string, serviceName: string) {
    if (!window.confirm(`Delete "${serviceName}"? This can't be undone.`)) return;
    setDeletingId(id);

    const [{ count: engagementCount }, { count: quoteCount }, { count: interestCount }, { data: automationRows, error: automationError }] =
      await Promise.all([
        supabase.from("engagements").select("id", { count: "exact", head: true }).eq("service_id", id),
        supabase.from("quotes").select("id", { count: "exact", head: true }).eq("service_id", id),
        supabase.from("client_service_interests").select("id", { count: "exact", head: true }).eq("service_id", id),
        supabase.from("automations").select("id, trigger_config, conditions").eq("workspace_id", workspaceId),
      ]);

    if (automationError) {
      setDeletingId(null);
      toast.show("Could not verify workflow references. Service was not deleted.", "error");
      return;
    }

    const serviceIdText = id.toLowerCase();
    const referencedByWorkflow = (automationRows ?? []).filter((row) =>
      JSON.stringify(row.trigger_config ?? {}).toLowerCase().includes(serviceIdText) ||
      JSON.stringify(row.conditions ?? []).toLowerCase().includes(serviceIdText)
    ).length;

    if ((engagementCount ?? 0) > 0 || (quoteCount ?? 0) > 0) {
      setDeletingId(null);
      toast.show(
        `"${serviceName}" is in use by ${engagementCount ?? 0} engagement(s) and ${quoteCount ?? 0} quote(s). Archive it instead of deleting it.`,
        "error"
      );
      return;
    }

    if (referencedByWorkflow > 0) {
      setDeletingId(null);
      toast.show(
        `"${serviceName}" is referenced by ${referencedByWorkflow} workflow(s). Remove the service reference from those workflows before deleting it.`,
        "error"
      );
      return;
    }

    if ((interestCount ?? 0) > 0) {
      const { error: interestDeleteError } = await supabase.from("client_service_interests").delete().eq("service_id", id);
      if (interestDeleteError) {
        setDeletingId(null);
        toast.show(interestDeleteError.message, "error");
        return;
      }
    }

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

      {canManage && (
        <div className="mt-4 rounded-2xl border border-border bg-surface p-4 shadow-soft">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink">Service categories</p>
            <p className="mt-1 text-[11px] text-muted">
              Rename or remove categories. Removing a category does not delete its services; they become Uncategorized.
            </p>
          </div>
          <div className="mt-3 space-y-2">
            {categories.length === 0 ? (
              <p className="text-sm text-muted">No categories yet.</p>
            ) : (
              categories.map((category) => (
                <div key={category.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                  {editingCategoryId === category.id ? (
                    <>
                      <input
                        autoFocus
                        value={categoryName}
                        onChange={(e) => setCategoryName(e.target.value)}
                        className="min-w-0 flex-1 rounded-lg border border-border px-2.5 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void saveCategory();
                          if (e.key === "Escape") cancelEditCategory();
                        }}
                      />
                      <button type="button" onClick={() => void saveCategory()} disabled={savingCategory} className="rounded-lg p-1.5 text-accent hover:bg-accentSoft disabled:opacity-60" aria-label="Save category">
                        <Check size={14} />
                      </button>
                      <button type="button" onClick={cancelEditCategory} className="rounded-lg p-1.5 text-muted hover:text-ink" aria-label="Cancel">
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{category.name}</span>
                      <button type="button" onClick={() => beginEditCategory(category)} className="rounded-lg p-1.5 text-muted hover:text-accent" aria-label={`Edit ${category.name}`}>
                        <Pencil size={14} />
                      </button>
                      <button type="button" onClick={() => void deleteCategory(category)} disabled={deletingCategoryId === category.id} className="rounded-lg p-1.5 text-muted hover:text-danger disabled:opacity-60" aria-label={`Delete ${category.name}`}>
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <div className="mt-4">
        {filtered.length === 0 ? (
          <EmptyState message={services.length === 0 ? "No services yet -- create one to attach a pipeline, form, and requirements." : "No services match."} />
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
              <p className="text-xs text-muted">You&apos;ll set the pipeline, form, and other requirements after creating it.</p>
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
