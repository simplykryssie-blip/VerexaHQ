"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { TemplateSelect } from "@/components/settings/TemplateSelect";
import { OrganizerServiceRouting } from "@/components/settings/OrganizerServiceRouting";

type Option = { id: string; name: string };

export type ServiceDetailsRow = {
  id: string;
  name: string;
  workspace_id: string | null;
  description: string | null;
  estimated_duration_minutes: number | null;
  is_bookable: boolean;
  is_portal_visible: boolean;
  service_category_id: string | null;
  organizer_template_id: string | null;
};

export function ServiceDetailsTab({
  service,
  workspaceId,
  categories,
  organizerTemplates,
  hasPipeline,
}: {
  service: ServiceDetailsRow;
  workspaceId: string;
  categories: Option[];
  organizerTemplates: Option[];
  /** Whether this service already has a pipeline built -- just changes the link's wording. */
  hasPipeline: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSystem = !service.workspace_id;

  const [name, setName] = useState(service.name);
  const [description, setDescription] = useState(service.description ?? "");
  const [durationMinutes, setDurationMinutes] = useState(service.estimated_duration_minutes?.toString() ?? "");
  const [isBookable, setIsBookable] = useState(service.is_bookable);
  const [isPortalVisible, setIsPortalVisible] = useState(service.is_portal_visible);
  const [categoryId, setCategoryId] = useState(service.service_category_id ?? "");
  const [organizerTemplateId, setOrganizerTemplateId] = useState(service.organizer_template_id ?? "");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const { error: updateError } = await supabase
      .from("services")
      .update({
        name,
        description: description.trim() || null,
        estimated_duration_minutes: durationMinutes ? Number(durationMinutes) : null,
        is_bookable: isBookable,
        is_portal_visible: isPortalVisible,
        service_category_id: categoryId || null,
        organizer_template_id: organizerTemplateId || null,
      })
      .eq("id", service.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  async function deleteService() {
    setDeleting(true);
    setError(null);
    const { count } = await supabase.from("engagements").select("id", { count: "exact", head: true }).eq("service_id", service.id);
    if ((count ?? 0) > 0) {
      setDeleting(false);
      setError(
        `This service has ${count} existing engagement${count === 1 ? "" : "s"} and can't be deleted -- go to Services and click its status badge to cycle it to Archived instead.`
      );
      return;
    }
    if (!window.confirm(`Delete "${service.name}"? This can't be undone.`)) {
      setDeleting(false);
      return;
    }
    const { error: deleteError } = await supabase.from("services").delete().eq("id", service.id);
    setDeleting(false);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    router.push("/settings/services");
  }

  if (isSystem) {
    return <p className="text-sm text-muted">This is a system default and can&apos;t be edited here. Clone it from Services to customize.</p>;
  }

  return (
    <div className="max-w-xl space-y-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (shown to clients when booking)"
        rows={2}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <TemplateSelect value={categoryId} onChange={setCategoryId} options={categories} placeholder="Category" />
      <input
        type="number"
        min="5"
        step="5"
        value={durationMinutes}
        onChange={(e) => setDurationMinutes(e.target.value)}
        placeholder="Duration in minutes (used for self-booking)"
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm text-slate">
          <input type="checkbox" checked={isBookable} onChange={(e) => setIsBookable(e.target.checked)} className="h-4 w-4 rounded border-border" />
          Bookable
        </label>
        <label className="flex items-center gap-2 text-sm text-slate">
          <input
            type="checkbox"
            checked={isPortalVisible}
            onChange={(e) => setIsPortalVisible(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Portal visible
        </label>
      </div>

      <Link
        href={`/pipelines/${service.id}`}
        className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
      >
        {hasPipeline ? "Edit this service's pipeline" : "Build a pipeline for this service"} &rarr;
      </Link>

      <button
        type="button"
        onClick={() => setAdvancedOpen((v) => !v)}
        className="mt-3 flex w-full items-center justify-between text-xs font-medium text-muted hover:text-ink"
      >
        Incoming-form matching
        <ChevronDown size={14} className={`transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
      </button>
      {advancedOpen && (
        <div className="space-y-2 rounded-lg border border-border bg-surfaceMuted p-3">
          <TemplateSelect value={organizerTemplateId} onChange={setOrganizerTemplateId} options={organizerTemplates} placeholder="Organizer template" />
          <p className="text-xs text-muted">
            When a client submits this organizer form before any engagement exists for them, it gets matched to this service --
            that&apos;s all this does. It doesn&apos;t send anything and it isn&apos;t a Workflow. To make something happen
            automatically, set that up under Workflows instead.
          </p>
          {organizerTemplateId && <OrganizerServiceRouting workspaceId={workspaceId} organizerTemplateId={organizerTemplateId} />}
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && !error && <p className="text-sm text-success">Saved.</p>}

      <div className="flex items-center justify-between gap-2 pt-2">
        <button
          type="button"
          onClick={deleteService}
          disabled={deleting || saving}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-60"
        >
          {deleting ? "Deleting..." : "Delete"}
        </button>
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
