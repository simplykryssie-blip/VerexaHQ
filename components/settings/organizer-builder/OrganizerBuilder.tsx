"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import type { OrganizerFieldType } from "@/lib/organizer/fieldTypes";
import { FieldPalette } from "./FieldPalette";
import { FieldCanvas } from "./FieldCanvas";
import { FieldPropertiesPanel } from "./FieldPropertiesPanel";
import { OrganizerPreviewPanel } from "./OrganizerPreviewPanel";
import { PublicLinkToggle } from "@/components/settings/PublicLinkToggle";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";
import type { BuilderField, BuilderTemplate } from "./types";

function sortByOrder(fields: BuilderField[]): BuilderField[] {
  return [...fields].sort((a, b) => a.display_order - b.display_order);
}

/** Flattens a desired arrangement into the single sequence reorder_organizer_fields expects. */
function flattenOrder(topLevelIds: string[], childOrderByParent: Map<string, string[]>): string[] {
  return topLevelIds.flatMap((id) => [id, ...(childOrderByParent.get(id) ?? [])]);
}

export function OrganizerBuilder({ template, initialFields, readOnly }: { template: BuilderTemplate; initialFields: BuilderField[]; readOnly: boolean }) {
  const supabase = createClient();
  const toast = useToast();
  const [fields, setFields] = useState<BuilderField[]>(initialFields);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [draggedType, setDraggedType] = useState<OrganizerFieldType | null>(null);
  const [view, setView] = useState<"build" | "preview">("build");

  const topLevelFields = sortByOrder(fields.filter((f) => !f.parent_field_id));
  const childrenByParent = new Map<string, BuilderField[]>();
  for (const f of fields) {
    if (f.parent_field_id) {
      childrenByParent.set(f.parent_field_id, sortByOrder([...(childrenByParent.get(f.parent_field_id) ?? []), f]));
    }
  }
  const selectedField = fields.find((f) => f.id === selectedFieldId) ?? null;

  function currentLaneIds(lane: string | null): string[] {
    return lane === null ? topLevelFields.map((f) => f.id) : (childrenByParent.get(lane) ?? []).map((f) => f.id);
  }

  async function commitOrder(topLevelIds: string[], childOverride?: { parentId: string; ids: string[] }) {
    const childMap = new Map<string, string[]>();
    for (const t of topLevelFields) childMap.set(t.id, currentLaneIds(t.id));
    if (childOverride) childMap.set(childOverride.parentId, childOverride.ids);

    const flat = flattenOrder(topLevelIds, childMap);
    const { error } = await supabase.rpc("reorder_organizer_fields", { p_template_id: template.id, p_field_ids: flat });
    if (error) {
      toast.show(error.message, "error");
      return false;
    }
    setFields((prev) => prev.map((f) => ({ ...f, display_order: flat.indexOf(f.id) })));
    return true;
  }

  async function addField(type: OrganizerFieldType, parentFieldId: string | null, atIndex: number) {
    const nextOrder = fields.length > 0 ? Math.max(...fields.map((f) => f.display_order)) + 1 : 0;
    const { data, error } = await supabase
      .from("organizer_fields")
      .insert({
        organizer_template_id: template.id,
        parent_field_id: parentFieldId,
        field_type: type,
        label: "New question",
        display_order: nextOrder,
        is_required: false,
        options: [],
      })
      .select("*")
      .single();
    if (error || !data) {
      toast.show(error?.message ?? "Could not add field.", "error");
      return;
    }
    const newField = data as BuilderField;
    setFields((prev) => [...prev, newField]);
    setSelectedFieldId(newField.id);

    const lane = parentFieldId;
    const laneIds = currentLaneIds(lane);
    laneIds.splice(atIndex, 0, newField.id);
    if (lane === null) {
      await commitOrder(laneIds);
    } else {
      await commitOrder(
        topLevelFields.map((f) => f.id),
        { parentId: lane, ids: laneIds }
      );
    }
  }

  async function reorder(lane: string | null, fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    const laneIds = currentLaneIds(lane);
    const [moved] = laneIds.splice(fromIndex, 1);
    laneIds.splice(toIndex, 0, moved);
    if (lane === null) {
      await commitOrder(laneIds);
    } else {
      await commitOrder(
        topLevelFields.map((f) => f.id),
        { parentId: lane, ids: laneIds }
      );
    }
  }

  async function updateField(fieldId: string, patch: Partial<BuilderField>) {
    const { error } = await supabase
      .from("organizer_fields")
      .update(patch as never)
      .eq("id", fieldId);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setFields((prev) => prev.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)));
  }

  async function deleteField(fieldId: string) {
    // organizer_response_answers.organizer_field_id is a CASCADE foreign key.
    // Unlike deleting a whole template (blocked outright by a NO ACTION FK on
    // organizer_responses -- see OrganizerLibrary.tsx), nothing in the
    // database stops a single field from being removed out from under
    // answers a client already submitted. Check first so routine template
    // editing never silently destroys real answers.
    const descendantIds = fields.filter((f) => f.parent_field_id === fieldId).map((f) => f.id);
    const { count } = await supabase
      .from("organizer_response_answers")
      .select("id", { count: "exact", head: true })
      .in("organizer_field_id", [fieldId, ...descendantIds]);
    if (count && count > 0) {
      toast.show(
        `Can't delete -- ${count} client answer${count === 1 ? "" : "s"} already exist for this question. Archive the template instead if it needs to be retired.`,
        "error"
      );
      return;
    }

    if (!confirm("Remove this field? This can't be undone.")) return;
    const { error } = await supabase.from("organizer_fields").delete().eq("id", fieldId);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setFields((prev) => prev.filter((f) => f.id !== fieldId && f.parent_field_id !== fieldId));
    setSelectedFieldId((prev) => (prev === fieldId ? null : prev));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-4">
        <Link href="/templates?tab=organizers" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink">
          <ArrowLeft size={14} /> Organizer templates
        </Link>
        <div className="text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-accent">Organizer builder</p>
          <p className="text-sm font-semibold text-ink">
            {template.name} {readOnly && <span className="ml-1 rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-medium text-muted">System</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!readOnly && (
            <PublicLinkToggle
              table="organizer_templates"
              id={template.id}
              path="o"
              publicToken={template.public_token}
              status={template.status}
              initialIsPublic={template.is_public}
              initialRequiresPortalSignup={template.requires_portal_signup}
            />
          )}
          {!readOnly && <TemplateStatusCycle table="organizer_templates" id={template.id} status={template.status} />}
          <button
            type="button"
            onClick={() => setView((v) => (v === "build" ? "preview" : "build"))}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent"
          >
            {view === "build" ? "Preview" : "Back to builder"}
          </button>
        </div>
      </header>

      {readOnly && (
        <p className="border-b border-border bg-surfaceMuted px-4 py-2 text-xs text-muted">
          This is a system default and can&apos;t be edited here -- clone the service it belongs to first.
        </p>
      )}

      {view === "preview" ? (
        <OrganizerPreviewPanel
          templateName={template.name}
          templateDescription={template.description}
          topLevelFields={topLevelFields}
          childrenByParent={childrenByParent}
        />
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {!readOnly && <FieldPalette onAdd={(type) => addField(type, null, topLevelFields.length)} onDragType={setDraggedType} />}
          <FieldCanvas
            topLevelFields={topLevelFields}
            childrenByParent={childrenByParent}
            selectedFieldId={selectedFieldId}
            onSelect={setSelectedFieldId}
            draggedType={draggedType}
            onAddField={addField}
            onReorder={reorder}
            readOnly={readOnly}
          />
          <FieldPropertiesPanel
            field={selectedField}
            otherTopLevelFields={topLevelFields.filter((f) => f.id !== selectedFieldId && f.field_type !== "page_break")}
            onUpdate={updateField}
            onDelete={deleteField}
            readOnly={readOnly}
          />
        </div>
      )}
    </div>
  );
}
