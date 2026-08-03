import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { EmptyState } from "@/components/EmptyState";

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
      <h2 className="text-base font-semibold text-ink">Roles & Permissions</h2>
      <p className="mt-1 text-sm text-muted">
        System roles are shared across every Verexa workspace; workspace-custom roles are specific to
        yours.
      </p>

      <div className="mt-6 rounded-xl border border-border bg-surface">
        {!roles || roles.length === 0 ? (
          <EmptyState message="No roles found." />
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
