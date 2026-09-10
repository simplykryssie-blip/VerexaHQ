"use client";

import { Fragment, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Columns2 } from "lucide-react";
import { FIELD_TYPE_LABELS, type OrganizerFieldType } from "@/lib/organizer/fieldTypes";
import { FIELD_TYPE_ICONS, FIELD_TYPE_TONE } from "@/lib/organizer/fieldTypeIcons";
import { fieldColSpanClass, isWidthEligible } from "@/lib/organizer/layoutWidth";
import { IconChip } from "@/components/ui/IconChip";
import type { BuilderField } from "./types";

type Lane = string | null; // parent_field_id this drag/drop is scoped to; null = top level
type DropTarget = { lane: Lane; index: number } | null;

function DropIndicator() {
  return <div className="col-span-12 my-0.5 h-1 rounded-full bg-accent" aria-hidden="true" />;
}

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
      className={`${fieldColSpanClass(field.field_type, field.layout_width)} cursor-pointer rounded-lg border p-3 shadow-soft transition ${
        selected ? "border-accent bg-accentSoft" : isDragging ? "border-accent border-dashed" : "border-border bg-surface hover:border-accent/50 hover:shadow-softHover"
      }`}
    >
      <div className="flex items-center justify-between gap-2 text-sm">
        <div className="flex min-w-0 items-center gap-2">
          {!readOnly && <MoveButtons canMoveUp={canMoveUp} canMoveDown={canMoveDown} onMoveUp={onMoveUp} onMoveDown={onMoveDown} />}
          <IconChip tone={FIELD_TYPE_TONE[field.field_type]}>
            {(() => {
              const Icon = FIELD_TYPE_ICONS[field.field_type];
              return <Icon size={16} aria-hidden="true" />;
            })()}
          </IconChip>
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
          {field.is_internal_only && (
            <span className="rounded-full bg-amberSoft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber">Internal</span>
          )}
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
  onDraggingChange,
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
  /** Reordering an already-placed field is dragged entirely within this
   *  component (unlike a new field from the palette, tracked one level up
   *  as draggedType) -- surfaced so the field-properties overlay can also
   *  stop intercepting pointer events for this kind of drag. */
  onDraggingChange?: (dragging: boolean) => void;
  readOnly: boolean;
}) {
  const [draggedField, setDraggedField] = useState<{ id: string; lane: Lane; index: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);

  // A drag can end (or drop) outside of any tracked target -- e.g. released
  // over the sidebar, or cancelled with Escape -- so clear the indicator
  // globally rather than only from the handlers below, or it can get stuck
  // showing a stale line after an aborted drag.
  useEffect(() => {
    function clear() {
      setDropTarget(null);
      setDraggedField(null);
      onDraggingChange?.(false);
    }
    window.addEventListener("dragend", clear);
    window.addEventListener("drop", clear);
    return () => {
      window.removeEventListener("dragend", clear);
      window.removeEventListener("drop", clear);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Splits each field block into a top half/bottom half so hovering over
  // the top of a block previews "insert before it" and the bottom previews
  // "insert after it" -- without this, dropping anywhere on a block always
  // looked and behaved the same regardless of where the cursor actually was.
  function handleFieldDragOver(e: React.DragEvent, lane: Lane, index: number) {
    e.preventDefault();
    if (readOnly) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const isTopHalf = e.clientY - rect.top < rect.height / 2;
    setDropTarget({ lane, index: isTopHalf ? index : index + 1 });
  }

  function handleLaneEndDragOver(e: React.DragEvent, lane: Lane, laneLength: number) {
    e.preventDefault();
    if (readOnly) return;
    setDropTarget({ lane, index: laneLength });
  }

  function handleDrop(lane: Lane) {
    if (!readOnly && dropTarget && dropTarget.lane === lane) {
      const targetIndex = dropTarget.index;
      if (draggedType) {
        onAddField(draggedType, lane, targetIndex);
      } else if (draggedField && draggedField.lane === lane) {
        // toIndex is applied after fromIndex has already been spliced out,
        // so a move further down the same lane needs to shift back by one.
        const adjustedIndex = draggedField.index < targetIndex ? targetIndex - 1 : targetIndex;
        onReorder(lane, draggedField.index, adjustedIndex);
      }
    }
    setDraggedField(null);
    setDropTarget(null);
    onDraggingChange?.(false);
  }

  return (
    <main className="flex-1 overflow-y-auto bg-surfaceMuted p-6">
      <div className="mx-auto max-w-2xl">
        {topLevelFields.length === 0 && (
          <p className="rounded-lg border border-dashed border-border bg-surface p-6 text-center text-sm text-muted">
            No fields yet -- drag one in from the palette to get started.
          </p>
        )}

        <div className="@container grid grid-cols-12 gap-3">
          {topLevelFields.map((field, index) => (
            <Fragment key={field.id}>
              {dropTarget?.lane === null && dropTarget.index === index && <DropIndicator />}
              <FieldBlock
                field={field}
                selected={selectedFieldId === field.id}
                onSelect={() => onSelect(field.id)}
                isDragging={draggedField?.id === field.id}
                onDragStart={() => {
                  if (readOnly) return;
                  setDraggedField({ id: field.id, lane: null, index });
                  onDraggingChange?.(true);
                }}
                onDragOver={(e) => handleFieldDragOver(e, null, index)}
                onDrop={() => handleDrop(null)}
                onToggleWidth={() => onToggleWidth(field.id)}
                readOnly={readOnly}
                canMoveUp={index > 0}
                canMoveDown={index < topLevelFields.length - 1}
                onMoveUp={() => onMoveField(null, index, -1)}
                onMoveDown={() => onMoveField(null, index, 1)}
              />

              {field.field_type === "repeating_section" && (
                <div className="@container col-span-12 ml-6 grid grid-cols-12 gap-2 border-l-2 border-border pl-4">
                  {(childrenByParent.get(field.id) ?? []).map((child, childIndex, children) => (
                    <Fragment key={child.id}>
                      {dropTarget?.lane === field.id && dropTarget.index === childIndex && <DropIndicator />}
                      <FieldBlock
                        field={child}
                        selected={selectedFieldId === child.id}
                        onSelect={() => onSelect(child.id)}
                        isDragging={draggedField?.id === child.id}
                        onDragStart={() => {
                          if (readOnly) return;
                          setDraggedField({ id: child.id, lane: field.id, index: childIndex });
                          onDraggingChange?.(true);
                        }}
                        onDragOver={(e) => handleFieldDragOver(e, field.id, childIndex)}
                        onDrop={() => handleDrop(field.id)}
                        onToggleWidth={() => onToggleWidth(child.id)}
                        readOnly={readOnly}
                        canMoveUp={childIndex > 0}
                        canMoveDown={childIndex < children.length - 1}
                        onMoveUp={() => onMoveField(field.id, childIndex, -1)}
                        onMoveDown={() => onMoveField(field.id, childIndex, 1)}
                      />
                    </Fragment>
                  ))}
                  {dropTarget?.lane === field.id && dropTarget.index === (childrenByParent.get(field.id) ?? []).length && <DropIndicator />}
                  {!readOnly && (
                    <div
                      onDragOver={(e) => handleLaneEndDragOver(e, field.id, (childrenByParent.get(field.id) ?? []).length)}
                      onDrop={() => handleDrop(field.id)}
                      className={`col-span-12 rounded-lg border border-dashed p-2 text-center text-xs transition ${
                        dropTarget?.lane === field.id ? "border-accent bg-accentSoft text-accent" : "border-border text-muted"
                      }`}
                    >
                      + Drop a field here to add it inside &quot;{field.label}&quot;
                    </div>
                  )}
                </div>
              )}
            </Fragment>
          ))}
          {dropTarget?.lane === null && dropTarget.index === topLevelFields.length && <DropIndicator />}
        </div>

        {!readOnly && (
          <div
            onDragOver={(e) => handleLaneEndDragOver(e, null, topLevelFields.length)}
            onDrop={() => handleDrop(null)}
            className={`mt-3 rounded-lg border border-dashed p-4 text-center text-xs transition ${
              dropTarget?.lane === null && dropTarget.index === topLevelFields.length ? "border-accent bg-accentSoft text-accent" : "border-border text-muted"
            }`}
          >
            + Drop a field here
          </div>
        )}
      </div>
    </main>
  );
}
