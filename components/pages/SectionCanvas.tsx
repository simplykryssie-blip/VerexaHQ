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
}: {
  sections: BuilderSection[];
  selectedSectionId: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onDelete: (id: string) => void;
  accentColor?: string;
  services?: BookableServiceOption[];
  staff?: StaffOption[];
}) {
  if (sections.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-10 text-center text-sm text-muted">
        Add a section from the left to start building this page.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-white p-4">
      <div className="mx-auto max-w-3xl space-y-3">
        {sections.map((section, i) => (
          <div
            key={section.id}
            onClick={() => onSelect(section.id)}
            className={`relative cursor-pointer rounded-xl border-2 transition ${
              selectedSectionId === section.id ? "border-accent" : "border-transparent hover:border-border"
            }`}
          >
            <div className="flex items-center justify-between border-b border-border bg-surfaceMuted px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
              <span>{SECTION_TYPE_LABELS[section.section_type]}</span>
              <div className="flex items-center gap-1">
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
            </div>
            <div className="pointer-events-none">
              <SectionPreview section={section} accentColor={accentColor} services={services} staff={staff} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
