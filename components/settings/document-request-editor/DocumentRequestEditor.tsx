"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { TemplateStatusCycle } from "@/components/settings/TemplateStatusCycle";
import { InlineAddForm } from "@/components/InlineAddForm";
import { EmptyState } from "@/components/EmptyState";
import { IconChip } from "@/components/ui/IconChip";
import { getCategoryStyle } from "@/lib/documentRequests/categoryStyle";

type Template = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  workspace_id: string | null;
};

type Item = {
  id: string;
  document_request_template_id: string;
  category: string | null;
  name: string;
  instructions: string | null;
  is_required: boolean;
  display_order: number;
  default_folder_name: string | null;
};

const ITEM_FIELDS = [
  { name: "name", label: "Document name (e.g. Prior-year tax return)", required: true },
  { name: "category", label: "Category (optional grouping)" },
  { name: "is_required", label: "Required?", type: "select" as const, required: true, options: [{ value: "true", label: "Required" }, { value: "false", label: "Optional" }] },
  { name: "instructions", label: "Instructions shown to the client", type: "textarea" as const },
  { name: "default_folder_name", label: "File into folder named (optional)" },
];

export function DocumentRequestEditor({ template, items: initialItems }: { template: Template; items: Item[] }) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const readOnly = !template.workspace_id;
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? "");
  const [savingHeader, setSavingHeader] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [items, setItems] = useState(initialItems);

  async function saveHeader() {
    setSavingHeader(true);
    const { error } = await supabase.from("document_request_templates").update({ name, description: description || null }).eq("id", template.id);
    setSavingHeader(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    toast.show("Saved", "success");
    router.refresh();
  }

  async function addItem(values: Record<string, string>) {
    const nextOrder = items.length > 0 ? Math.max(...items.map((i) => i.display_order)) + 1 : 1;
    const { error } = await supabase.from("document_request_items").insert({
      document_request_template_id: template.id,
      name: values.name,
      category: values.category || "",
      is_required: values.is_required === "true",
      instructions: values.instructions || null,
      default_folder_name: values.default_folder_name || null,
      display_order: nextOrder,
    });
    if (error) return error.message;
    router.refresh();
  }

  async function updateItem(values: Record<string, string>) {
    if (!editingItem) return "No item selected";
    const { error } = await supabase
      .from("document_request_items")
      .update({
        name: values.name,
        category: values.category || "",
        is_required: values.is_required === "true",
        instructions: values.instructions || null,
        default_folder_name: values.default_folder_name || null,
      })
      .eq("id", editingItem.id);
    if (error) return error.message;
    setEditingItem(null);
    router.refresh();
  }

  async function deleteItem(item: Item) {
    if (!window.confirm(`Remove "${item.name}" from this checklist?`)) return;
    const { error } = await supabase.from("document_request_items").delete().eq("id", item.id);
    if (error) {
      toast.show(
        error.code === "23503" ? "Can't remove -- this item has already been used in a sent document request." : error.message,
        "error"
      );
      return;
    }
    toast.show("Item removed", "success");
    router.refresh();
  }

  const sortedItems = [...items].sort((a, b) => a.display_order - b.display_order);

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  // A drag can end outside any tracked drop target -- clear the indicator
  // globally so an aborted drag never leaves a stale line on screen.
  useEffect(() => {
    function clear() {
      setDraggedId(null);
      setDropIndex(null);
    }
    window.addEventListener("dragend", clear);
    window.addEventListener("drop", clear);
    return () => {
      window.removeEventListener("dragend", clear);
      window.removeEventListener("drop", clear);
    };
  }, []);

  async function persistOrder(orderedIds: string[]) {
    setItems((prev) => prev.map((i) => ({ ...i, display_order: orderedIds.indexOf(i.id) })));
    const results = await Promise.all(
      orderedIds.map((id, index) => supabase.from("document_request_items").update({ display_order: index }).eq("id", id))
    );
    const err = results.find((r) => r.error)?.error;
    if (err) toast.show(err.message, "error");
    router.refresh();
  }

  function handleItemDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const isTopHalf = e.clientY - rect.top < rect.height / 2;
    setDropIndex(isTopHalf ? index : index + 1);
  }

  function handleItemDrop() {
    if (draggedId !== null && dropIndex !== null) {
      const currentOrder = sortedItems.map((i) => i.id);
      const fromIndex = currentOrder.indexOf(draggedId);
      if (fromIndex !== -1) {
        const without = currentOrder.filter((id) => id !== draggedId);
        const adjustedIndex = fromIndex < dropIndex ? dropIndex - 1 : dropIndex;
        without.splice(adjustedIndex, 0, draggedId);
        persistOrder(without);
      }
    }
    setDraggedId(null);
    setDropIndex(null);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface px-4">
        <Link href="/templates?tab=document-requests" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-ink">
          <ArrowLeft size={14} /> Document Requests
        </Link>
        <div className="text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-accent">Checklist</p>
          <p className="text-sm font-semibold text-ink">
            {template.name} {readOnly && <span className="ml-1 rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-medium text-muted">System</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">{!readOnly && <TemplateStatusCycle table="document_request_templates" id={template.id} status={template.status} />}</div>
      </header>

      <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 overflow-y-auto px-4 py-6">
        {!readOnly && (
          <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
            <div className="space-y-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Checklist name"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm font-medium focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (staff-facing, optional)"
                rows={2}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={saveHeader}
                  disabled={savingHeader || (name === template.name && description === (template.description ?? ""))}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
                >
                  {savingHeader ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-surface p-4 shadow-soft">
          <h3 className="text-sm font-semibold text-ink">Documents to request</h3>

          <div className="mt-3">
            {sortedItems.length === 0 ? (
              <EmptyState message="No items yet -- add the documents you want to request below." />
            ) : (
              <ul>
                {sortedItems.map((item, idx) => {
                  const { icon: CategoryIcon, tone } = getCategoryStyle(item.category);
                  return (
                    <li key={item.id}>
                      {dropIndex === idx && <div className="h-1 rounded-full bg-accent" aria-hidden="true" />}
                      <div
                        draggable={!readOnly}
                        onDragStart={() => setDraggedId(item.id)}
                        onDragOver={(e) => !readOnly && handleItemDragOver(e, idx)}
                        onDrop={() => !readOnly && handleItemDrop()}
                        className={`flex items-start gap-3 border-b border-border py-3 ${!readOnly ? "cursor-grab active:cursor-grabbing" : ""} ${
                          draggedId === item.id ? "opacity-40" : ""
                        }`}
                      >
                        <IconChip tone={tone} className="mt-0.5">
                          <CategoryIcon size={16} aria-hidden="true" />
                        </IconChip>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-ink">{item.name}</span>
                            {item.is_required ? (
                              <span className="rounded-full bg-accentSoft px-2 py-0.5 text-[10px] font-medium text-accent">Required</span>
                            ) : (
                              <span className="rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-medium text-muted">Optional</span>
                            )}
                            {item.category && <span className="text-xs text-muted">{item.category}</span>}
                          </div>
                          {item.instructions && <p className="mt-0.5 text-xs text-muted">{item.instructions}</p>}
                          {item.default_folder_name && <p className="mt-0.5 text-[11px] text-muted">Files into: {item.default_folder_name}</p>}
                        </div>
                        {!readOnly && (
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setEditingItem(item)}
                              aria-label={`Edit ${item.name}`}
                              className="rounded p-1 text-muted hover:bg-accentSoft hover:text-accent"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteItem(item)}
                              aria-label={`Remove ${item.name}`}
                              className="rounded p-1 text-muted hover:bg-danger/10 hover:text-danger"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
                {dropIndex === sortedItems.length && <div className="h-1 rounded-full bg-accent" aria-hidden="true" />}
              </ul>
            )}
          </div>

          {!readOnly && !editingItem && (
            <div className="mt-4">
              <InlineAddForm label="Add a document" fields={ITEM_FIELDS} onSubmit={addItem} submitLabel="Add" />
            </div>
          )}

          {editingItem && (
            <div className="mt-4">
              <InlineAddForm
                key={editingItem.id}
                label="Edit document"
                fields={ITEM_FIELDS}
                initialValues={{
                  name: editingItem.name,
                  category: editingItem.category ?? "",
                  is_required: editingItem.is_required ? "true" : "false",
                  instructions: editingItem.instructions ?? "",
                  default_folder_name: editingItem.default_folder_name ?? "",
                }}
                defaultOpen
                onSubmit={updateItem}
                submitLabel="Save changes"
              />
              <button type="button" onClick={() => setEditingItem(null)} className="mt-1 text-xs text-muted hover:text-ink">
                Cancel edit
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
