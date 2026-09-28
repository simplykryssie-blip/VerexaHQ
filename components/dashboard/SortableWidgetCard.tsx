"use client";

import type { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Eye, EyeOff, GripVertical } from "lucide-react";

/**
 * Wraps one real dashboard card so it becomes the drag surface itself
 * (rather than a proxy row in a separate list) while in Customize mode.
 * Dragging is confined to the card's own section by construction --
 * DashboardShell mounts one DndContext/SortableContext pair per
 * WIDGET_SECTIONS entry, so `over` can only ever be a sibling already in
 * the same section (a widget's section is fixed by its type, not by
 * display_order, so cross-section drops wouldn't move it there anyway).
 */
export function SortableWidgetCard({
  id,
  title,
  isVisible,
  editing,
  saving,
  onToggleVisible,
  children,
}: {
  id: string;
  title: string;
  isVisible: boolean;
  /** Customize mode is on -- shows the grip handle/eye toggle overlay and disables interaction with the card's own content (links, buttons) so dragging doesn't fight with normal clicks. */
  editing: boolean;
  saving: boolean;
  onToggleVisible: () => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !editing });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative rounded-2xl transition ${isDragging ? "z-10 opacity-60 shadow-lg" : ""} ${
        editing ? "ring-2 ring-accent/30 ring-offset-2 ring-offset-canvas" : ""
      }`}
    >
      {editing && (
        <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-lg border border-border bg-surface px-1.5 py-1 shadow-soft">
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Drag to reorder ${title}`}
            className="cursor-grab touch-none rounded p-1 text-muted hover:text-ink active:cursor-grabbing"
          >
            <GripVertical size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onToggleVisible}
            aria-label={isVisible ? `Hide ${title}` : `Show ${title}`}
            className="rounded p-1 text-muted hover:text-ink disabled:opacity-30"
          >
            {isVisible ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
        </div>
      )}
      <div className={editing ? "pointer-events-none select-none" : undefined}>{children}</div>
    </div>
  );
}
