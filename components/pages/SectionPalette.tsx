import { SECTION_TYPES, SECTION_TYPE_LABELS, type SectionType } from "./types";

export function SectionPalette({ onAdd }: { onAdd: (type: SectionType) => void }) {
  return (
    <aside className="w-48 shrink-0 overflow-y-auto border-r border-border bg-surfaceMuted p-3">
      <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted">Add a section</p>
      <div className="mt-2 space-y-1">
        {SECTION_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onAdd(type)}
            className="block w-full rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate hover:bg-surface hover:text-accent"
          >
            {SECTION_TYPE_LABELS[type]}
          </button>
        ))}
      </div>
    </aside>
  );
}
