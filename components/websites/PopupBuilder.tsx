"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";
import { SectionPalette } from "@/components/pages/SectionPalette";
import { SectionCanvas } from "@/components/pages/SectionCanvas";
import { SectionPropertiesPanel } from "@/components/pages/SectionPropertiesPanel";
import { SectionPreview } from "@/components/pages/SectionPreview";
import { POPUP_SECTION_TYPES, type BuilderSection, type SectionType, type OrganizerTemplateOption } from "@/components/pages/types";
import { PopupSettingsPanel, type PopupSettings, type PopupSettingsPatch } from "./PopupSettingsPanel";

const DEBOUNCE_MS = 600;

export function PopupBuilder({
  websiteId,
  popup,
  initialSections,
  pageOptions,
  canManage,
  organizerTemplates,
}: {
  websiteId: string;
  popup: PopupSettings & { id: string; workspace_id: string; name: string; status: string };
  initialSections: BuilderSection[];
  pageOptions: { id: string; title: string }[];
  canManage: boolean;
  organizerTemplates: OrganizerTemplateOption[];
}) {
  const supabase = createClient();
  const toast = useToast();
  const [name, setName] = useState(popup.name);
  const [sections, setSections] = useState<BuilderSection[]>([...initialSections].sort((a, b) => a.display_order - b.display_order));
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [view, setView] = useState<"build" | "preview">("build");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState(popup.background_color);
  const [customCss, setCustomCss] = useState(popup.custom_css);
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const selectedSection = sections.find((s) => s.id === selectedSectionId) ?? null;

  async function commitName() {
    const trimmed = name.trim() || popup.name;
    setName(trimmed);
    if (trimmed === popup.name) return;
    const { error } = await supabase.from("site_popups").update({ name: trimmed }).eq("id", popup.id);
    if (error) toast.show(error.message, "error");
  }

  async function addSection(type: SectionType) {
    const nextOrder = sections.length;
    const { data, error } = await supabase
      .from("site_popup_sections")
      .insert({ popup_id: popup.id, section_type: type, display_order: nextOrder, config: {} })
      .select("id, section_type, display_order, config")
      .single();
    if (error || !data) {
      toast.show(error?.message ?? "Could not add section.", "error");
      return;
    }
    setSections((prev) => [...prev, data as BuilderSection]);
    setSelectedSectionId(data.id);
  }

  async function moveSection(id: string, direction: "up" | "down") {
    const index = sections.findIndex((s) => s.id === id);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= sections.length) return;

    const reordered = [...sections];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    setSections(reordered.map((s, i) => ({ ...s, display_order: i })));

    const { error } = await supabase.rpc("reorder_site_popup_sections", { p_popup_id: popup.id, p_section_ids: reordered.map((s) => s.id) });
    if (error) toast.show(error.message, "error");
  }

  async function deleteSection(id: string) {
    if (!confirm("Remove this section? This can't be undone.")) return;
    const remaining = sections.filter((s) => s.id !== id);
    setSections(remaining);
    if (selectedSectionId === id) setSelectedSectionId(null);
    const { error } = await supabase.from("site_popup_sections").delete().eq("id", id);
    if (error) toast.show(error.message, "error");
    if (remaining.length > 0) {
      await supabase.rpc("reorder_site_popup_sections", { p_popup_id: popup.id, p_section_ids: remaining.map((s) => s.id) });
    }
  }

  function updateSectionConfig(id: string, patch: Record<string, unknown>) {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, config: { ...s.config, ...patch } } : s)));

    clearTimeout(debounceTimers.current[id]);
    debounceTimers.current[id] = setTimeout(async () => {
      const current = sections.find((s) => s.id === id);
      const merged = { ...(current?.config ?? {}), ...patch };
      const { error } = await supabase.from("site_popup_sections").update({ config: merged as never }).eq("id", id);
      if (error) toast.show(error.message, "error");
    }, DEBOUNCE_MS);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4">
        <Link href={`/websites/${websiteId}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink">
          <ArrowLeft size={14} /> Website
        </Link>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2 px-4">
          {canManage ? (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitName}
              className="w-56 truncate rounded-lg border border-transparent px-2 py-1 text-center text-sm font-semibold text-ink hover:border-border focus:border-accent focus:outline-none"
            />
          ) : (
            <p className="truncate text-sm font-semibold text-ink">{name}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canManage && <TemplateStatusCycle table="site_popups" id={popup.id} status={popup.status} />}
          {canManage && (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              title="Popup settings"
              aria-label="Popup settings"
              className="rounded-lg border border-border p-1.5 text-muted hover:border-accent hover:text-accent"
            >
              <Settings size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setView((v) => (v === "build" ? "preview" : "build"))}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent"
          >
            {view === "build" ? "Preview" : "Back to builder"}
          </button>
        </div>
      </header>

      {view === "preview" ? (
        <div className="flex-1 overflow-y-auto" style={{ background: backgroundColor || "#ffffff" }}>
          {customCss && <style dangerouslySetInnerHTML={{ __html: customCss }} />}
          {sections
            .slice()
            .sort((a, b) => a.display_order - b.display_order)
            .map((s) => (
              <SectionPreview key={s.id} section={s} customCss={customCss} />
            ))}
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {canManage && <SectionPalette onAdd={addSection} types={POPUP_SECTION_TYPES} />}
          <SectionCanvas
            sections={sections}
            selectedSectionId={selectedSectionId}
            onSelect={setSelectedSectionId}
            onMove={moveSection}
            onDelete={deleteSection}
            customCss={customCss}
            backgroundColor={backgroundColor}
          />
          {canManage && (
            <SectionPropertiesPanel
              workspaceId={popup.workspace_id}
              section={selectedSection}
              onUpdate={updateSectionConfig}
              organizerTemplates={organizerTemplates}
              bookableServices={[]}
              staff={[]}
              canAdvanceToNextPage={false}
            />
          )}
        </div>
      )}

      {settingsOpen && (
        <PopupSettingsPanel
          popup={popup}
          pageOptions={pageOptions}
          onClose={() => setSettingsOpen(false)}
          onSaved={(patch: PopupSettingsPatch) => {
            setBackgroundColor(patch.background_color);
            setCustomCss(patch.custom_css);
          }}
        />
      )}
    </div>
  );
}
