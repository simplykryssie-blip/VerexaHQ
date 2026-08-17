"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Pencil, Trash2, Copy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";

type FolderItem = { id: string; parent_item_id: string | null; name: string; display_order: number };

function FolderRow({
  item,
  siblings,
  hasChildren = false,
  canEdit,
  onError,
}: {
  item: FolderItem;
  siblings: FolderItem[];
  hasChildren?: boolean;
  canEdit: boolean;
  onError: (msg: string) => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(item.name);
  const [busy, setBusy] = useState(false);

  const index = siblings.findIndex((s) => s.id === item.id);
  const canMoveUp = index > 0;
  const canMoveDown = index >= 0 && index < siblings.length - 1;

  async function saveRename() {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === item.name) {
      setRenaming(false);
      setRenameValue(item.name);
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("document_folder_template_items").update({ name: trimmed }).eq("id", item.id);
    setBusy(false);
    if (error) {
      onError(error.message);
      return;
    }
    setRenaming(false);
    toast.show("Folder renamed", "success");
    router.refresh();
  }

  async function move(direction: "up" | "down") {
    const swapWith = siblings[direction === "up" ? index - 1 : index + 1];
    if (!swapWith) return;
    setBusy(true);
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from("document_folder_template_items").update({ display_order: swapWith.display_order }).eq("id", item.id),
      supabase.from("document_folder_template_items").update({ display_order: item.display_order }).eq("id", swapWith.id),
    ]);
    setBusy(false);
    if (e1 || e2) {
      onError(e1?.message ?? e2?.message ?? "Could not reorder.");
      return;
    }
    router.refresh();
  }

  async function remove() {
    if (!window.confirm(`Delete "${item.name}"?${hasChildren ? " This also deletes its subfolders." : ""}`)) return;
    setBusy(true);
    const { error } = await supabase.from("document_folder_template_items").delete().eq("id", item.id);
    setBusy(false);
    if (error) {
      onError(error.message);
      return;
    }
    toast.show("Folder deleted", "success");
    router.refresh();
  }

  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      {renaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={saveRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveRename();
            if (e.key === "Escape") {
              setRenaming(false);
              setRenameValue(item.name);
            }
          }}
          className="flex-1 rounded-lg border border-border px-2 py-1 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      ) : (
        <span className="flex-1 text-sm text-slate">{item.name}</span>
      )}
      {canEdit && !renaming && (
        <div className="flex items-center gap-1">
          <button type="button" disabled={busy || !canMoveUp} onClick={() => move("up")} className="text-muted hover:text-ink disabled:opacity-30">
            <ChevronUp size={14} />
          </button>
          <button type="button" disabled={busy || !canMoveDown} onClick={() => move("down")} className="text-muted hover:text-ink disabled:opacity-30">
            <ChevronDown size={14} />
          </button>
          <button type="button" disabled={busy} onClick={() => setRenaming(true)} className="text-muted hover:text-accent">
            <Pencil size={13} />
          </button>
          <button type="button" disabled={busy} onClick={remove} className="text-muted hover:text-danger">
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

function AddFolderInput({ onAdd, placeholder }: { onAdd: (name: string) => Promise<void>; placeholder: string }) {
  const [value, setValue] = useState("");
  const [adding, setAdding] = useState(false);

  async function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    setAdding(true);
    await onAdd(trimmed);
    setAdding(false);
    setValue("");
  }

  return (
    <div className="mt-2 flex gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder={placeholder}
        disabled={adding}
        className="flex-1 rounded-lg border border-border px-2 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <button
        type="button"
        onClick={submit}
        disabled={adding || !value.trim()}
        className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-slate hover:border-accent hover:text-accent disabled:opacity-60"
      >
        {adding ? "Adding..." : "Add"}
      </button>
    </div>
  );
}

function ReadOnlyTree({ items }: { items: FolderItem[] }) {
  const topLevel = items.filter((i) => !i.parent_item_id).sort((a, b) => a.display_order - b.display_order);
  return (
    <ul className="space-y-1 text-sm text-slate">
      {topLevel.map((f) => {
        const children = items.filter((i) => i.parent_item_id === f.id).sort((a, b) => a.display_order - b.display_order);
        return (
          <li key={f.id}>
            {f.name}
            {children.length > 0 && (
              <ul className="ml-4 mt-0.5 space-y-0.5 text-xs text-muted">
                {children.map((c) => (
                  <li key={c.id}>{c.name}</li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function FolderTemplateEditor({
  serviceId,
  workspaceId,
  templateId,
  templateName,
  isSystemDefault,
  canEdit,
  items,
}: {
  serviceId: string;
  workspaceId: string;
  templateId: string | null;
  templateName: string | null;
  isSystemDefault: boolean;
  canEdit: boolean;
  items: FolderItem[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [cloning, setCloning] = useState(false);

  if (!templateId) {
    return <p className="text-sm text-muted">No document folder template linked yet -- select one above and save first.</p>;
  }
  const currentTemplateId = templateId;

  async function cloneToCustomize() {
    setCloning(true);
    setError(null);
    const { data: newId, error: cloneError } = await supabase.rpc("duplicate_config_object", {
      p_table: "document_folder_templates",
      p_id: currentTemplateId,
      p_target_workspace_id: workspaceId,
    });
    if (cloneError) {
      setCloning(false);
      setError(cloneError.message);
      return;
    }
    const { error: updateError } = await supabase.from("services").update({ document_folder_template_id: newId as string }).eq("id", serviceId);
    setCloning(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    toast.show("Template cloned", "success");
    router.refresh();
  }

  const topLevel = items.filter((i) => !i.parent_item_id).sort((a, b) => a.display_order - b.display_order);

  async function addTopLevel(name: string) {
    const nextOrder = Math.max(0, ...topLevel.map((f) => f.display_order)) + 1;
    const { error: insertError } = await supabase
      .from("document_folder_template_items")
      .insert({ document_folder_template_id: currentTemplateId, parent_item_id: null, name, display_order: nextOrder });
    if (insertError) {
      setError(insertError.message);
      return;
    }
    toast.show("Folder added", "success");
    router.refresh();
  }

  async function addChild(parentId: string, children: FolderItem[], name: string) {
    const nextOrder = Math.max(0, ...children.map((c) => c.display_order)) + 1;
    const { error: insertError } = await supabase
      .from("document_folder_template_items")
      .insert({ document_folder_template_id: currentTemplateId, parent_item_id: parentId, name, display_order: nextOrder });
    if (insertError) {
      setError(insertError.message);
      return;
    }
    toast.show("Folder added", "success");
    router.refresh();
  }

  if (isSystemDefault) {
    return (
      <div>
        <p className="text-sm text-muted">
          &quot;{templateName}&quot; is a system default and can&apos;t be edited here.
        </p>
        <div className="mt-2 rounded-lg border border-border bg-surfaceMuted p-3">
          <ReadOnlyTree items={items} />
        </div>
        <button
          type="button"
          onClick={cloneToCustomize}
          disabled={cloning}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline disabled:opacity-60"
        >
          <Copy size={12} /> {cloning ? "Cloning..." : "Clone to customize"}
        </button>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
    );
  }

  if (!canEdit) {
    return (
      <div>
        <p className="text-sm text-muted">Only workspace admins can edit this service&apos;s document folders.</p>
        <div className="mt-2 rounded-lg border border-border bg-surfaceMuted p-3">
          <ReadOnlyTree items={items} />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      {topLevel.length === 0 && <p className="text-sm text-muted">No folders yet.</p>}
      <div className="divide-y divide-border">
        {topLevel.map((folder) => {
          const children = items.filter((i) => i.parent_item_id === folder.id).sort((a, b) => a.display_order - b.display_order);
          return (
            <div key={folder.id} className="py-1.5">
              <FolderRow item={folder} siblings={topLevel} hasChildren={children.length > 0} canEdit={canEdit} onError={setError} />
              <div className="ml-5">
                {children.map((child) => (
                  <FolderRow key={child.id} item={child} siblings={children} canEdit={canEdit} onError={setError} />
                ))}
                <AddFolderInput placeholder="Add subfolder..." onAdd={(name) => addChild(folder.id, children, name)} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 border-t border-border pt-2">
        <AddFolderInput placeholder="Add folder..." onAdd={addTopLevel} />
      </div>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
