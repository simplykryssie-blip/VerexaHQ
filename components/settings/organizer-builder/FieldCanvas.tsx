"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronUp, Columns2 } from "lucide-react";
import { FIELD_TYPE_LABELS, type OrganizerFieldType } from "@/lib/organizer/fieldTypes";
import { fieldColSpanClass, isWidthEligible } from "@/lib/organizer/layoutWidth";
import type { BuilderField } from "./types";

type Lane = string | null; // parent_field_id this drag/drop is scoped to; null = top level

function MoveButtons({ canMoveUp, canMoveDown, onMoveUp, onMoveDown }: { canMoveUp: boolean; canMoveDown: boolean; onMoveUp: () => void; onMoveDown: () => void }) {
  return (
    <div className="flex shrink-0 flex-col">
      <button
        type="button"
        disabled={!canMoveUp}
        onClick={(e) => {
          e.stopPropagation();
          onMoveUp();
        }}
        title="Move up"
        aria-label="Move field up"
        className="rounded p-0.5 text-muted transition hover:bg-surfaceMuted hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronUp size={13} aria-hidden="true" />
      </button>
      <button
        type="button"
        disabled={!canMoveDown}
        onClick={(e) => {
          e.stopPropagation();
          onMoveDown();
        }}
        title="Move down"
        aria-label="Move field down"
        className="rounded p-0.5 text-muted transition hover:bg-surfaceMuted hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
      >
        <ChevronDown size={13} aria-hidden="true" />
      </button>
    </div>
  );
}

function FieldBlock({
  field,
  selected,
  onSelect,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging,
  onToggleWidth,
  readOnly,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: {
  field: BuilderField;
  selected: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  isDragging: boolean;
  onToggleWidth: () => void;
  readOnly: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  if (field.field_type === "page_break") {
    return (
      <div
        draggable
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={onSelect}
        className={`col-span-12 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed p-2 transition ${
          selected ? "border-accent bg-accentSoft" : isDragging ? "border-accent" : "border-muted/60 hover:border-accent/50"
        }`}
      >
        {!readOnly && <MoveButtons canMoveUp={canMoveUp} canMoveDown={canMoveDown} onMoveUp={onMoveUp} onMoveDown={onMoveDown} />}
        <span className="h-px flex-1 border-t border-dashed border-current text-muted" aria-hidden="true" />
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">
          ✂ Page break{field.label && field.label !== "New question" ? ` -- ${field.label}` : ""}
        </span>
        <span className="h-px flex-1 border-t border-dashed border-current text-muted" aria-hidden="true" />
      </div>
    );
  }

  const isHalf = field.layout_width === "half";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onSelect}
      className={`${fieldColSpanClass(field.field_type, field.layout_width)} cursor-pointer rounded-lg border p-3 transition ${
        selected ? "border-accent bg-accentSoft" : isDragging ? "border-accent border-dashed" : "border-border bg-surface hover:border-accent/50"
      }`}
    >
      <div className="flex items-center justify-between gap-2 text-sm">
        <div className="flex min-w-0 items-center gap-1.5">
          {!readOnly && <MoveButtons canMoveUp={canMoveUp} canMoveDown={canMoveDown} onMoveUp={onMoveUp} onMoveDown={onMoveDown} />}
          <span className="min-w-0 truncate font-medium text-ink">
            {field.label ? (
              field.label
            ) : (
              <span className="italic text-muted">{FIELD_TYPE_LABELS[field.field_type]}</span>
            )}{" "}
            {field.is_required && <span className="text-danger">*</span>}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-xs text-muted">{FIELD_TYPE_LABELS[field.field_type]}</span>
          {isWidthEligible(field.field_type) && (
            <button
              type="button"
              disabled={readOnly}
              onClick={(e) => {
                e.stopPropagation();
                onToggleWidth();
              }}
              title={isHalf ? "Half width -- click to make full width" : "Full width -- click to shrink to half"}
              className={`rounded p-1 transition disabled:cursor-not-allowed ${
                isHalf ? "bg-accent text-white" : "text-muted hover:bg-surfaceMuted hover:text-ink"
              }`}
            >
              <Columns2 size={13} aria-hidden="true" />
            </button>
          )}
        </div>
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
  onMoveField,
  onToggleWidth,
  readOnly,
}: {
  topLevelFields: BuilderField[];
  childrenByParent: Map<string, BuilderField[]>;
  selectedFieldId: string | null;
  onSelect: (fieldId: string) => void;
  draggedType: OrganizerFieldType | null;
  onAddField: (type: OrganizerFieldType, parentFieldId: string | null, atIndex: number) => void;
  onReorder: (lane: Lane, fromIndex: number, toIndex: number) => void;
  onMoveField: (lane: Lane, index: number, direction: -1 | 1) => void;
  onToggleWidth: (fieldId: string) => void;
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
      <div className="mx-auto max-w-2xl">
        {topLevelFields.length === 0 && (
          <p className="rounded-lg border border-dashed border-border bg-surface p-6 text-center text-sm text-muted">
            No fields yet -- drag one in from the palette to get started.
          </p>
        )}

        <div className="grid grid-cols-12 gap-3">
          {topLevelFields.map((field, index) => (
            <Fragment key={field.id}>
              <FieldBlock
                field={field}
                selected={selectedFieldId === field.id}
                onSelect={() => onSelect(field.id)}
                isDragging={draggedField?.id === field.id}
                onDragStart={() => !readOnly && setDraggedField({ id: field.id, lane: null, index })}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => !readOnly && handleDropOnField(null, index)}
                onToggleWidth={() => onToggleWidth(field.id)}
                readOnly={readOnly}
                canMoveUp={index > 0}
                canMoveDown={index < topLevelFields.length - 1}
                onMoveUp={() => onMoveField(null, index, -1)}
                onMoveDown={() => onMoveField(null, index, 1)}
              />

              {field.field_type === "repeating_section" && (
                <div className="col-span-12 ml-6 grid grid-cols-12 gap-2 border-l-2 border-border pl-4">
                  {(childrenByParent.get(field.id) ?? []).map((child, childIndex, children) => (
                    <FieldBlock
                      key={child.id}
                      field={child}
                      selected={selectedFieldId === child.id}
                      onSelect={() => onSelect(child.id)}
                      isDragging={draggedField?.id === child.id}
                      onDragStart={() => !readOnly && setDraggedField({ id: child.id, lane: field.id, index: childIndex })}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => !readOnly && handleDropOnField(field.id, childIndex)}
                      onToggleWidth={() => onToggleWidth(child.id)}
                      readOnly={readOnly}
                      canMoveUp={childIndex > 0}
                      canMoveDown={childIndex < children.length - 1}
                      onMoveUp={() => onMoveField(field.id, childIndex, -1)}
                      onMoveDown={() => onMoveField(field.id, childIndex, 1)}
                    />
                  ))}
                  {!readOnly && (
                    <div
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDropOnLaneEnd(field.id, (childrenByParent.get(field.id) ?? []).length + 1)}
                      className="col-span-12 rounded-lg border border-dashed border-border p-2 text-center text-xs text-muted"
                    >
                      + Drop a field here to add it inside &quot;{field.label}&quot;
                    </div>
                  )}
                </div>
              )}
            </Fragment>
          ))}
        </div>

        {!readOnly && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDropOnLaneEnd(null, topLevelFields.length + 1)}
            className="mt-3 rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted"
          >
            + Drop a field here
          </div>
        )}
      </div>
    </main>
  );
}
