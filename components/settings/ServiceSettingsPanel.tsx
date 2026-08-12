"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { TemplateSelect } from "@/components/settings/TemplateSelect";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";
import { OrganizerServiceRouting } from "@/components/settings/OrganizerServiceRouting";

type Option = { id: string; name: string };

export type ServiceSettingsRow = {
  id: string;
  name: string;
  status: string;
  description: string | null;
  estimated_duration_minutes: number | null;
  is_bookable: boolean;
  is_portal_visible: boolean;
  organizer_template_id: string | null;
};

export function ServiceSettingsPanel({
  service,
  workspaceId,
  organizerTemplates,
}: {
  service: ServiceSettingsRow;
  workspaceId: string;
  organizerTemplates: Option[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState(service.name);
  const [description, setDescription] = useState(service.description ?? "");
  const [durationMinutes, setDurationMinutes] = useState(service.estimated_duration_minutes?.toString() ?? "");
  const [isBookable, setIsBookable] = useState(service.is_bookable);
  const [isPortalVisible, setIsPortalVisible] = useState(service.is_portal_visible);
  const [organizerTemplateId, setOrganizerTemplateId] = useState(service.organizer_template_id ?? "");

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
        `This service has ${count} existing engagement${count === 1 ? "" : "s"} and can't be deleted -- cycle its status to Archived instead.`
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

  return (
    <div className="max-w-xl space-y-2">
      <div className="flex items-center justify-between gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <TemplateStatusCycle table="services" id={service.id} status={service.status} />
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (shown to clients when booking)"
        rows={2}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
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

      <div className="space-y-2 rounded-lg border border-border bg-surfaceMuted p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Incoming-form matching</p>
        <TemplateSelect value={organizerTemplateId} onChange={setOrganizerTemplateId} options={organizerTemplates} placeholder="Organizer template" />
        <p className="text-xs text-muted">
          When a client submits this organizer form before any engagement exists for them, it gets matched to this service --
          that&apos;s all this does. To send this form to a client, use the pipeline below; to make something happen automatically,
          set that up under Workflows instead.
        </p>
        {organizerTemplateId && <OrganizerServiceRouting workspaceId={workspaceId} organizerTemplateId={organizerTemplateId} />}
      </div>

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
