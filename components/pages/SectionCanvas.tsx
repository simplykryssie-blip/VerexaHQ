"use client";

import { ChevronUp, ChevronDown, Trash2 } from "lucide-react";
import { SectionPreview } from "./SectionPreview";
import { SECTION_TYPE_LABELS, type BuilderSection, type BookableServiceOption, type StaffOption } from "./types";

export function SectionCanvas({
  sections,
  selectedSectionId,
  onSelect,
  onMove,
  onDelete,
  accentColor,
  services,
  staff,
  customCss,
  backgroundColor,
}: {
  sections: BuilderSection[];
  selectedSectionId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onDelete: (id: string) => void;
  accentColor?: string;
  services?: BookableServiceOption[];
  staff?: StaffOption[];
  customCss?: string | null;
  backgroundColor?: string | null;
}) {
  if (sections.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-center text-sm text-muted">
        Add a section from the left to start building this page.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: backgroundColor || "#ffffff" }}>
      {customCss && <style dangerouslySetInnerHTML={{ __html: customCss }} />}
      {/* No max-width cap and no gap between sections here -- this must match
       * PublicSitePage.tsx exactly (each section controls its own width and
       * full-bleed background) so what staff see while editing is what
       * visitors actually get, not a narrower editor-only mockup. Selection
       * and the move/delete toolbar are pure overlays (ring + absolutely
       * positioned button group) so they never affect layout or width. */}
      {sections.map((section, i) => (
        <div
          key={section.id}
          onClick={() => onSelect(section.id)}
          className={`group relative cursor-pointer transition ${
            selectedSectionId === section.id ? "ring-2 ring-inset ring-accent" : "ring-1 ring-inset ring-transparent hover:ring-border"
          }`}
        >
          <div
            className={`absolute right-2 top-2 z-10 items-center gap-1 rounded-lg border border-border bg-surface px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted shadow-soft ${
              selectedSectionId === section.id ? "flex" : "hidden group-hover:flex"
            }`}
          >
            <span className="mr-1 normal-case tracking-normal text-slate">{SECTION_TYPE_LABELS[section.section_type]}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMove(section.id, "up");
              }}
              disabled={i === 0}
              className="rounded p-0.5 hover:text-ink disabled:opacity-30"
              aria-label="Move section up"
            >
              <ChevronUp size={13} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMove(section.id, "down");
              }}
              disabled={i === sections.length - 1}
              className="rounded p-0.5 hover:text-ink disabled:opacity-30"
              aria-label="Move section down"
            >
              <ChevronDown size={13} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(section.id);
              }}
              className="rounded p-0.5 hover:text-danger"
              aria-label="Delete section"
            >
              <Trash2 size={13} />
            </button>
          </div>
          <div className="pointer-events-none">
            <SectionPreview section={section} accentColor={accentColor} services={services} staff={staff} customCss={customCss} />
          </div>
        </div>
      ))}
    </div>
  );
}
