"use client";

import { FIELD_TYPE_GROUPS, type OrganizerFieldType } from "@/lib/organizer/fieldTypes";

export function FieldPalette({
  onAdd,
  onDragType,
  hasSelection,
}: {
  onAdd: (type: OrganizerFieldType) => void;
  onDragType: (type: OrganizerFieldType | null) => void;
  /** Whether a field is currently selected on the canvas -- changes the helper text and where a tap inserts. */
  hasSelection: boolean;
}) {
  return (
    <aside className="w-60 shrink-0 overflow-y-auto border-r border-border bg-surface p-4">
      <p className="text-xs font-semibold text-ink">Field types</p>
      <p className="mt-1 text-xs text-muted">
        {hasSelection
          ? "Tap a type to add it right after the selected question (or drag it onto the canvas)."
          : "Tap a type to add it to the end (or drag it onto the canvas)."}
      </p>

      {FIELD_TYPE_GROUPS.map((g) => (
        <div key={g.group} className="mt-4">
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted">{g.group}</h3>
          <div className="mt-1.5 space-y-1.5">
            {g.types.map((t) => (
              <button
                key={t.type}
                type="button"
                draggable
                onDragStart={() => onDragType(t.type)}
                onDragEnd={() => onDragType(null)}
                onClick={() => onAdd(t.type)}
                className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-left text-xs font-medium text-slate transition hover:border-accent hover:text-accent"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </aside>
  );
}
