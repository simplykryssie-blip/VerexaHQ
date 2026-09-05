"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";
import { SectionPalette } from "./SectionPalette";
import { SectionCanvas } from "./SectionCanvas";
import { SectionPropertiesPanel } from "./SectionPropertiesPanel";
import { SectionPreview } from "./SectionPreview";
import { PageSettingsPanel } from "./PageSettingsPanel";
import type { BuilderPage, BuilderSection, SectionType, OrganizerTemplateOption, BookableServiceOption, StaffOption } from "./types";

const DEBOUNCE_MS = 600;

export function PageBuilder({
  workspaceSlug,
  websiteId,
  websiteSlug,
  page,
  initialSections,
  canManage,
  organizerTemplates,
  bookableServices,
  staff,
}: {
  workspaceSlug: string;
  websiteId: string;
  websiteSlug: string;
  page: BuilderPage;
  initialSections: BuilderSection[];
  canManage: boolean;
  organizerTemplates: OrganizerTemplateOption[];
  bookableServices: BookableServiceOption[];
  staff: StaffOption[];
}) {
  const supabase = createClient();
  const toast = useToast();
  const [title, setTitle] = useState(page.title);
  const [slug, setSlug] = useState(page.slug);
  const [sections, setSections] = useState<BuilderSection[]>([...initialSections].sort((a, b) => a.display_order - b.display_order));
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [view, setView] = useState<"build" | "preview">("build");
  const [pageSettingsOpen, setPageSettingsOpen] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState(page.background_color);
  const [customCss, setCustomCss] = useState(page.custom_css);
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const selectedSection = sections.find((s) => s.id === selectedSectionId) ?? null;

  async function commitTitleSlug() {
    const trimmedTitle = title.trim() || page.title;
    const trimmedSlug = slug.trim() || page.slug;
    setTitle(trimmedTitle);
    setSlug(trimmedSlug);
    if (trimmedTitle === page.title && trimmedSlug === page.slug) return;
    const { error } = await supabase.from("site_pages").update({ title: trimmedTitle, slug: trimmedSlug }).eq("id", page.id);
    if (error) toast.show(error.message, "error");
  }

  async function addSection(type: SectionType) {
    const nextOrder = sections.length;
    const { data, error } = await supabase
      .from("site_page_sections")
      .insert({ page_id: page.id, section_type: type, display_order: nextOrder, config: {} })
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

    const { error } = await supabase.rpc("reorder_site_page_sections", { p_page_id: page.id, p_section_ids: reordered.map((s) => s.id) });
    if (error) toast.show(error.message, "error");
  }

  async function deleteSection(id: string) {
    if (!confirm("Remove this section? This can't be undone.")) return;
    const remaining = sections.filter((s) => s.id !== id);
    setSections(remaining);
    if (selectedSectionId === id) setSelectedSectionId(null);
    const { error } = await supabase.from("site_page_sections").delete().eq("id", id);
    if (error) toast.show(error.message, "error");
    // Compact display_order so a later reorder call's "exactly every section
    // once" validation doesn't choke on a gap left by the deleted row.
    if (remaining.length > 0) {
      await supabase.rpc("reorder_site_page_sections", { p_page_id: page.id, p_section_ids: remaining.map((s) => s.id) });
    }
  }

  function updateSectionConfig(id: string, patch: Record<string, unknown>) {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, config: { ...s.config, ...patch } } : s)));

    clearTimeout(debounceTimers.current[id]);
    debounceTimers.current[id] = setTimeout(async () => {
      const current = sections.find((s) => s.id === id);
      const merged = { ...(current?.config ?? {}), ...patch };
      const { error } = await supabase.from("site_page_sections").update({ config: merged as never }).eq("id", id);
      if (error) toast.show(error.message, "error");
    }, DEBOUNCE_MS);
  }

  const liveUrl = `/site/${workspaceSlug}/${websiteSlug}/${slug}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4">
        <Link href={`/websites/${websiteId}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink">
          <ArrowLeft size={14} /> Website
        </Link>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2 px-4">
          {canManage ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commitTitleSlug}
              className="w-56 truncate rounded-lg border border-transparent px-2 py-1 text-center text-sm font-semibold text-ink hover:border-border focus:border-accent focus:outline-none"
            />
          ) : (
            <p className="truncate text-sm font-semibold text-ink">{title}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {page.status === "published" && (
            <a href={liveUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
              <ExternalLink size={12} /> View live
            </a>
          )}
          {canManage && <TemplateStatusCycle table="site_pages" id={page.id} status={page.status} />}
          {canManage && (
            <button
              type="button"
              onClick={() => setPageSettingsOpen(true)}
              title="Page settings"
              aria-label="Page settings"
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

      {canManage && view === "build" && (
        <div className="flex items-center gap-3 border-b border-border bg-surfaceMuted px-4 py-2 text-xs">
          <label className="flex items-center gap-1.5 text-muted">
            URL slug
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              onBlur={commitTitleSlug}
              className="w-40 rounded border border-border px-1.5 py-0.5 text-ink focus:border-accent focus:outline-none"
            />
          </label>
          <span className="truncate text-muted">{liveUrl}</span>
        </div>
      )}

      {view === "preview" ? (
        <div className="flex-1 overflow-y-auto" style={{ backgroundColor: backgroundColor || "#ffffff" }}>
          {customCss && <style dangerouslySetInnerHTML={{ __html: customCss }} />}
          {sections
            .slice()
            .sort((a, b) => a.display_order - b.display_order)
            .map((s) => (
              <SectionPreview key={s.id} section={s} services={bookableServices} staff={staff} customCss={customCss} />
            ))}
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {canManage && <SectionPalette onAdd={addSection} />}
          <SectionCanvas
            sections={sections}
            selectedSectionId={selectedSectionId}
            onSelect={setSelectedSectionId}
            onMove={moveSection}
            onDelete={deleteSection}
            services={bookableServices}
            staff={staff}
            customCss={customCss}
          />
          {canManage && (
            <SectionPropertiesPanel
              workspaceId={page.workspace_id}
              section={selectedSection}
              onUpdate={updateSectionConfig}
              organizerTemplates={organizerTemplates}
              bookableServices={bookableServices}
              staff={staff}
              canAdvanceToNextPage={Boolean(page.funnel_id)}
            />
          )}
        </div>
      )}

      {pageSettingsOpen && (
        <PageSettingsPanel
          page={{ ...page, title, slug }}
          onClose={() => setPageSettingsOpen(false)}
          onSaved={(patch) => {
            setBackgroundColor(patch.background_color);
            setCustomCss(patch.custom_css);
          }}
        />
      )}
    </div>
  );
}
