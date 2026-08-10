import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { KeyRound } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";

export const dynamic = 'force-dynamic';

export default async function RolesPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: roles } = await supabase
    .from("roles")
    .select("id, name, slug, workspace_id, role_permissions(count)")
    .or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`)
    .order("name");

  return (
    <div className="max-w-3xl">
      <SettingsSectionHeader
        icon={KeyRound}
        title="Roles & Permissions"
        description="System roles are shared across every Verexa workspace; workspace-custom roles are specific to yours."
      />

      <div className="mt-6 rounded-xl border border-border bg-surface">
        {!roles || roles.length === 0 ? (
          <EmptyState icon={KeyRound} message="No roles found." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Permissions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {roles.map((r) => {
                const permCount = (r.role_permissions as unknown as { count: number }[])?.[0]?.count ?? 0;
                return (
                  <tr key={r.id}>
                    <td className="px-5 py-3 text-slate">{r.name}</td>
                    <td className="px-5 py-3 text-slate">{r.workspace_id ? "Workspace" : "System"}</td>
                    <td className="px-5 py-3 text-slate">{permCount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
