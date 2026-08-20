"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Check, X, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { SettingsCard } from "@/components/settings/SettingsCard";

export type TagRow = {
  id: string;
  name: string;
  client_count: number;
  automation_names: string[];
};

export function TagsManager({
  workspaceId,
  initialTags,
  canManage,
}: {
  workspaceId: string;
  initialTags: TagRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();

  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function addTag(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    if (!window.confirm(`Create a new tag: "${name}"?`)) return;

    setAdding(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("create_workspace_tag", { p_workspace_id: workspaceId, p_name: name });
    setAdding(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setNewName("");
    toast.show(`Tag "${name}" created`, "success");
    router.refresh();
  }

  function startEdit(tag: TagRow) {
    setEditingId(tag.id);
    setEditValue(tag.name);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValue("");
  }

  async function saveEdit(tag: TagRow) {
    const next = editValue.trim();
    if (!next || next === tag.name) {
      cancelEdit();
      return;
    }
    const usageNote =
      tag.automation_names.length > 0
        ? ` This will update ${tag.automation_names.length} automation${tag.automation_names.length === 1 ? "" : "s"} (${tag.automation_names.join(", ")}) and every client currently tagged "${tag.name}".`
        : tag.client_count > 0
          ? ` This will update ${tag.client_count} client${tag.client_count === 1 ? "" : "s"} currently tagged "${tag.name}".`
          : "";
    if (!window.confirm(`Rename "${tag.name}" to "${next}"?${usageNote}`)) return;

    setBusyId(tag.id);
    setError(null);
    const { error: rpcError } = await supabase.rpc("rename_workspace_tag", {
      p_workspace_id: workspaceId,
      p_tag_id: tag.id,
      p_new_name: next,
    });
    setBusyId(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    cancelEdit();
    toast.show("Tag renamed", "success");
    router.refresh();
  }

  async function deleteTag(tag: TagRow) {
    if (tag.automation_names.length > 0) {
      window.alert(
        `"${tag.name}" is still used by: ${tag.automation_names.join(", ")}. Update or remove it from those automations before deleting this tag.`
      );
      return;
    }
    const usageNote = tag.client_count > 0 ? ` It will be removed from ${tag.client_count} client${tag.client_count === 1 ? "" : "s"}.` : "";
    if (!window.confirm(`Delete the tag "${tag.name}"? This can't be undone.${usageNote}`)) return;

    setBusyId(tag.id);
    setError(null);
    const { error: rpcError } = await supabase.rpc("delete_workspace_tag", { p_workspace_id: workspaceId, p_tag_id: tag.id });
    setBusyId(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    toast.show("Tag deleted", "success");
    router.refresh();
  }

  return (
    <SettingsCard title={`${initialTags.length} tag${initialTags.length === 1 ? "" : "s"}`}>
      {canManage && (
        <form onSubmit={addTag} className="mb-4 flex items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New tag name"
            disabled={adding}
            className="w-64 rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={adding || !newName.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
          >
            <Plus size={14} aria-hidden="true" /> Add tag
          </button>
        </form>
      )}

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      {initialTags.length === 0 ? (
        <p className="text-sm text-muted">No tags yet.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="divide-y divide-border">
            {initialTags.map((tag) => (
              <div key={tag.id} className="px-4 py-3">
                {editingId === tag.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      disabled={busyId === tag.id}
                      className="min-w-0 flex-1 rounded-lg border border-border px-2.5 py-1.5 font-mono text-xs text-ink focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => saveEdit(tag)}
                      disabled={busyId === tag.id}
                      className="rounded-lg p-1.5 text-accent hover:bg-accentSoft disabled:opacity-60"
                      aria-label="Save"
                    >
                      <Check size={15} />
                    </button>
                    <button type="button" onClick={cancelEdit} className="rounded-lg p-1.5 text-muted hover:text-ink" aria-label="Cancel">
                      <X size={15} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 truncate rounded-lg bg-accentSoft px-2.5 py-1.5 font-mono text-xs font-medium text-accent">{tag.name}</span>
                    <span className="shrink-0 whitespace-nowrap text-xs text-muted">
                      {tag.client_count} client{tag.client_count === 1 ? "" : "s"}
                    </span>
                    <span
                      className="min-w-0 flex-1 truncate text-xs text-muted"
                      title={tag.automation_names.length > 0 ? tag.automation_names.join(", ") : undefined}
                    >
                      {tag.automation_names.length === 0 ? "Not used by any automation" : `Used by: ${tag.automation_names.join(", ")}`}
                    </span>
                    {canManage && (
                      <div className="ml-auto flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(tag)}
                          disabled={busyId === tag.id}
                          className="rounded-lg p-1.5 text-muted hover:text-ink disabled:opacity-60"
                          aria-label={`Rename ${tag.name}`}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteTag(tag)}
                          disabled={busyId === tag.id}
                          className="rounded-lg p-1.5 text-muted hover:text-danger disabled:opacity-60"
                          aria-label={`Delete ${tag.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </SettingsCard>
  );
}
