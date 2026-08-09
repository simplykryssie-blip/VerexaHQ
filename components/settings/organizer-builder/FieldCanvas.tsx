"use client";

import { useState } from "react";
import { FIELD_TYPE_LABELS, type OrganizerFieldType } from "@/lib/organizer/fieldTypes";
import type { BuilderField } from "./types";

type Lane = string | null; // parent_field_id this drag/drop is scoped to; null = top level

function FieldBlock({
  field,
  selected,
  onSelect,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging,
}: {
  field: BuilderField;
  selected: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  isDragging: boolean;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onSelect}
      className={`cursor-pointer rounded-lg border p-3 transition ${
        selected ? "border-accent bg-accentSoft" : isDragging ? "border-accent border-dashed" : "border-border bg-surface hover:border-accent/50"
      }`}
    >
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-ink">
          ☰ {field.label} {field.is_required && <span className="text-danger">*</span>}
        </span>
        <span className="text-xs text-muted">{FIELD_TYPE_LABELS[field.field_type]}</span>
      </div>
    </div>
  );
}

export function FieldCanvas({
  topLevelFields,
  childrenByParent,
  selectedFieldId,
  onSelect,
  draggedType,
  onAddField,
  onReorder,
  readOnly,
}: {
  topLevelFields: BuilderField[];
  childrenByParent: Map<string, BuilderField[]>;
  selectedFieldId: string | null;
  onSelect: (fieldId: string) => void;
  draggedType: OrganizerFieldType | null;
  onAddField: (type: OrganizerFieldType, parentFieldId: string | null, atIndex: number) => void;
  onReorder: (lane: Lane, fromIndex: number, toIndex: number) => void;
  readOnly: boolean;
}) {
  const [draggedField, setDraggedField] = useState<{ id: string; lane: Lane; index: number } | null>(null);

  function handleDropOnField(lane: Lane, targetIndex: number) {
    if (draggedType) {
      onAddField(draggedType, lane, targetIndex);
      return;
    }
    if (draggedField && draggedField.lane === lane) {
      onReorder(lane, draggedField.index, targetIndex);
    }
    setDraggedField(null);
  }

  function handleDropOnLaneEnd(lane: Lane, laneLength: number) {
    if (draggedType) {
      onAddField(draggedType, lane, laneLength);
      return;
    }
    if (draggedField && draggedField.lane === lane) {
      onReorder(lane, draggedField.index, laneLength - 1);
    }
    setDraggedField(null);
  }

  return (
    <main className="flex-1 overflow-y-auto bg-surfaceMuted p-6">
      <div className="mx-auto max-w-2xl space-y-3">
        {topLevelFields.length === 0 && (
          <p className="rounded-lg border border-dashed border-border bg-surface p-6 text-center text-sm text-muted">
            No fields yet -- drag one in from the palette to get started.
          </p>
        )}

        {topLevelFields.map((field, index) => (
          <div key={field.id}>
            <FieldBlock
              field={field}
              selected={selectedFieldId === field.id}
              onSelect={() => onSelect(field.id)}
              isDragging={draggedField?.id === field.id}
              onDragStart={() => !readOnly && setDraggedField({ id: field.id, lane: null, index })}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => !readOnly && handleDropOnField(null, index)}
            />

            {field.field_type === "repeating_section" && (
              <div className="ml-6 mt-2 space-y-2 border-l-2 border-border pl-4">
                {(childrenByParent.get(field.id) ?? []).map((child, childIndex) => (
                  <FieldBlock
                    key={child.id}
                    field={child}
                    selected={selectedFieldId === child.id}
                    onSelect={() => onSelect(child.id)}
                    isDragging={draggedField?.id === child.id}
                    onDragStart={() => !readOnly && setDraggedField({ id: child.id, lane: field.id, index: childIndex })}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => !readOnly && handleDropOnField(field.id, childIndex)}
                  />
                ))}
                {!readOnly && (
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDropOnLaneEnd(field.id, (childrenByParent.get(field.id) ?? []).length + 1)}
                    className="rounded-lg border border-dashed border-border p-2 text-center text-xs text-muted"
                  >
                    + Drop a field here to add it inside &quot;{field.label}&quot;
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {!readOnly && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDropOnLaneEnd(null, topLevelFields.length + 1)}
            className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted"
          >
            + Drop a field here
          </div>
        )}
      </div>
    </main>
  );
}
