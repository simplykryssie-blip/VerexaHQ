"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Plus, Trash2, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { Modal } from "@/components/Modal";
import { CreateRoleForm } from "@/components/settings/CreateRoleForm";

export type PermissionRow = { id: string; key: string; category: string; description: string };

export type RoleRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  workspace_id: string | null;
  is_system_role: boolean;
  permissionIds: string[];
  memberCount: number;
};

function formatCategory(category: string) {
  return category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function RolesManager({
  workspaceId,
  roles: initialRoles,
  permissions,
  isAdmin,
}: {
  workspaceId: string;
  roles: RoleRow[];
  permissions: PermissionRow[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const toast = useToast();
  const [roles, setRoles] = useState(initialRoles);
  const [selectedId, setSelectedId] = useState<string | null>(initialRoles[0]?.id ?? null);
  const [creating, setCreating] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const selected = roles.find((r) => r.id === selectedId) ?? null;

  const permissionsByCategory = useMemo(() => {
    const groups = new Map<string, PermissionRow[]>();
    for (const p of permissions) {
      const list = groups.get(p.category) ?? [];
      list.push(p);
      groups.set(p.category, list);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [permissions]);

  function selectRole(role: RoleRow) {
    setSelectedId(role.id);
    setEditingMeta(false);
  }

  async function togglePermission(role: RoleRow, permissionId: string) {
    if (!isAdmin) return;
    const has = role.permissionIds.includes(permissionId);
    setTogglingId(permissionId);
    setRoles((prev) =>
      prev.map((r) =>
        r.id === role.id
          ? { ...r, permissionIds: has ? r.permissionIds.filter((id) => id !== permissionId) : [...r.permissionIds, permissionId] }
          : r
      )
    );

    // System roles are shared platform-wide -- writing straight to role_permissions would
    // change this permission for every workspace using it. Instead this workspace's toggle
    // is recorded as an override on top of the role's global default set; custom roles (this
    // workspace's own) have no default to override, so those still write role_permissions
    // directly.
    const { error } = role.is_system_role
      ? await supabase
          .from("role_permission_overrides")
          .upsert({ role_id: role.id, workspace_id: workspaceId, permission_id: permissionId, granted: !has })
      : has
        ? await supabase.from("role_permissions").delete().eq("role_id", role.id).eq("permission_id", permissionId)
        : await supabase.from("role_permissions").insert({ role_id: role.id, permission_id: permissionId });

    setTogglingId(null);
    if (error) {
      setRoles((prev) =>
        prev.map((r) =>
          r.id === role.id
            ? { ...r, permissionIds: has ? [...r.permissionIds, permissionId] : r.permissionIds.filter((id) => id !== permissionId) }
            : r
        )
      );
      toast.show(error.message, "error");
      return;
    }
    router.refresh();
  }

  function startEditingMeta(role: RoleRow) {
    setNameDraft(role.name);
    setDescriptionDraft(role.description ?? "");
    setEditingMeta(true);
  }

  async function saveMeta(role: RoleRow) {
    if (!nameDraft.trim()) {
      toast.show("Role name is required.", "error");
      return;
    }
    setSavingMeta(true);
    const { error } = await supabase
      .from("roles")
      .update({ name: nameDraft.trim(), description: descriptionDraft.trim() || null })
      .eq("id", role.id);
    setSavingMeta(false);
    if (error) {
      toast.show(error.message, "error");
      return;
    }
    setRoles((prev) => prev.map((r) => (r.id === role.id ? { ...r, name: nameDraft.trim(), description: descriptionDraft.trim() || null } : r)));
    setEditingMeta(false);
    toast.show("Role updated", "success");
    router.refresh();
  }

  async function deleteRole(role: RoleRow) {
    if (role.memberCount > 0) {
      toast.show(
        `Reassign ${role.memberCount} team member${role.memberCount === 1 ? "" : "s"} to a different role before deleting this one.`,
        "error"
      );
      return;
    }
    if (!window.confirm(`Delete the "${role.name}" role? This can't be undone.`)) return;

    setDeleting(true);
    const { error } = await supabase.from("roles").delete().eq("id", role.id);
    setDeleting(false);
    if (error) {
      toast.show(error.code === "23503" ? "This role is still assigned to a team member." : error.message, "error");
      return;
    }
    setRoles((prev) => prev.filter((r) => r.id !== role.id));
    setSelectedId((prev) => (prev === role.id ? roles.find((r) => r.id !== role.id)?.id ?? null : prev));
    toast.show("Role deleted", "success");
    router.refresh();
  }

  function handleCreated(role: RoleRow) {
    setRoles((prev) => [...prev, role]);
    setSelectedId(role.id);
    setCreating(false);
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
      <div className="rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Roles</h3>
          {isAdmin && (
            <button type="button" onClick={() => setCreating(true)} className="text-accent hover:text-accent/80" aria-label="New custom role">
              <Plus size={14} />
            </button>
          )}
        </div>
        <ul className="divide-y divide-border">
          {roles.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => selectRole(r)}
                className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm transition ${
                  selectedId === r.id ? "bg-accentSoft text-accent" : "text-slate hover:bg-surfaceMuted"
                }`}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate">{r.name}</span>
                  <span className="shrink-0 rounded-full bg-surfaceMuted px-1.5 py-0.5 text-[10px] font-medium text-muted">
                    {r.is_system_role ? "System" : "Custom"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {isAdmin && (
          <div className="border-t border-border px-4 py-2.5">
            <button type="button" onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">
              <Plus size={14} /> New custom role
            </button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface">
        {!selected ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted">
            <KeyRound size={24} />
            <p className="text-sm">Select a role to view its permissions.</p>
          </div>
        ) : (
          <div>
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0 flex-1">
                {editingMeta ? (
                  <div className="space-y-2">
                    <input
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      className="w-full rounded-lg border border-border px-3 py-1.5 text-sm font-semibold focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                    <textarea
                      value={descriptionDraft}
                      onChange={(e) => setDescriptionDraft(e.target.value)}
                      placeholder="Description"
                      rows={2}
                      className="w-full rounded-lg border border-border px-3 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => saveMeta(selected)}
                        disabled={savingMeta}
                        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-60"
                      >
                        {savingMeta ? "Saving..." : "Save"}
                      </button>
                      <button type="button" onClick={() => setEditingMeta(false)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate hover:bg-surfaceMuted">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-ink">{selected.name}</h3>
                      <span className="shrink-0 rounded-full bg-surfaceMuted px-2 py-0.5 text-[10px] font-medium text-muted">
                        {selected.is_system_role ? "System" : "Custom"}
                      </span>
                    </div>
                    {selected.description && <p className="mt-1 text-xs text-muted">{selected.description}</p>}
                    <p className="mt-1.5 flex items-center gap-1 text-xs text-muted">
                      <Users size={12} /> {selected.memberCount} team member{selected.memberCount === 1 ? "" : "s"}
                    </p>
                  </>
                )}
              </div>

              {!editingMeta && isAdmin && !selected.is_system_role && (
                <div className="flex shrink-0 items-center gap-3">
                  <button type="button" onClick={() => startEditingMeta(selected)} className="text-xs font-medium text-accent hover:underline">
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteRole(selected)}
                    disabled={deleting}
                    className="inline-flex items-center gap-1 text-xs font-medium text-danger hover:underline disabled:opacity-60"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              )}
            </div>

            {selected.is_system_role && (
              <p className="border-b border-border bg-surfaceMuted px-5 py-2 text-xs text-muted">
                This is a shared System role -- toggling a permission below only changes it for your workspace. Every other firm
                using {selected.name} keeps their own settings.
              </p>
            )}

            <div className="max-h-[560px] divide-y divide-border overflow-y-auto">
              {permissionsByCategory.map(([category, perms]) => (
                <div key={category} className="px-5 py-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">{formatCategory(category)}</h4>
                  <ul className="mt-2 space-y-2">
                    {perms.map((p) => {
                      const checked = selected.permissionIds.includes(p.id);
                      return (
                        <li key={p.id} className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm text-ink">{p.description}</p>
                            <p className="font-mono text-[11px] text-muted">{p.key}</p>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={checked}
                            onClick={() => togglePermission(selected, p.id)}
                            disabled={!isAdmin || togglingId === p.id}
                            title={selected.is_system_role ? "Applies only to your workspace" : undefined}
                            className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-60 ${checked ? "bg-accent" : "bg-surfaceMuted"}`}
                          >
                            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${checked ? "left-[22px]" : "left-0.5"}`} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {creating && (
        <Modal title="New custom role" onClose={() => setCreating(false)}>
          <CreateRoleForm workspaceId={workspaceId} roles={roles} onCreated={handleCreated} onCancel={() => setCreating(false)} />
        </Modal>
      )}
    </div>
  );
}
