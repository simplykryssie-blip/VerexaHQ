"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { slugify, uniqueSlug } from "@/lib/roleSlug";
import type { RoleRow } from "@/components/settings/RolesManager";

export function CreateRoleForm({
  workspaceId,
  roles,
  onCreated,
  onCancel,
}: {
  workspaceId: string;
  roles: RoleRow[];
  onCreated: (role: RoleRow) => void;
  onCancel: () => void;
}) {
  const supabase = createClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cloneFromId, setCloneFromId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Role name is required.");
      return;
    }
    setSaving(true);
    setError(null);

    const takenSlugs = new Set(roles.filter((r) => r.workspace_id === workspaceId).map((r) => r.slug));
    const slug = uniqueSlug(slugify(name), takenSlugs);

    const { data: role, error: insertError } = await supabase
      .from("roles")
      .insert({ workspace_id: workspaceId, name: name.trim(), slug, description: description.trim() || null })
      .select("id, name, slug, description, workspace_id, is_system_role")
      .single();

    if (insertError || !role) {
      setSaving(false);
      setError(insertError?.message ?? "Could not create role.");
      return;
    }

    const cloneFrom = cloneFromId ? roles.find((r) => r.id === cloneFromId) : null;
    let permissionIds: string[] = [];
    if (cloneFrom && cloneFrom.permissionIds.length > 0) {
      const { error: cloneError } = await supabase
        .from("role_permissions")
        .insert(cloneFrom.permissionIds.map((permissionId) => ({ role_id: role.id, permission_id: permissionId })));
      if (cloneError) {
        toast.show(`Role created, but couldn't copy permissions: ${cloneError.message}`, "error");
      } else {
        permissionIds = cloneFrom.permissionIds;
      }
    }

    setSaving(false);
    onCreated({ ...role, permissionIds, memberCount: 0 });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="text-xs font-medium text-muted">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Senior Preparer"
          required
          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-muted">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-muted">Start from</label>
        <select
          value={cloneFromId}
          onChange={(e) => setCloneFromId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="">No permissions (start blank)</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              Copy permissions from {r.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate hover:bg-surfaceMuted">
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
        >
          {saving ? "Creating..." : "Create role"}
        </button>
      </div>
    </form>
  );
}
