import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { EmptyState } from "@/components/EmptyState";

export default async function UsersPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: members } = await supabase
    .from("workspace_users")
    .select("id, status, is_owner, user_profiles(display_name), roles(name)")
    .eq("workspace_id", workspace.id)
    .order("created_at" as never, { ascending: true });

  return (
    <div className="max-w-3xl">
      <h2 className="text-base font-semibold text-ink">Users & Staff</h2>
      <p className="mt-1 text-sm text-muted">Everyone with access to this workspace.</p>

      <div className="mt-6 rounded-xl border border-border bg-surface">
        {!members || members.length === 0 ? (
          <EmptyState message="No workspace members found." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surfaceMuted text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {members.map((m) => {
                const profile = m.user_profiles as unknown as { display_name: string | null } | null;
                const role = m.roles as unknown as { name: string } | null;
                return (
                  <tr key={m.id}>
                    <td className="px-5 py-3 text-slate">
                      {profile?.display_name ?? "--"}
                      {m.is_owner && <span className="ml-2 text-xs text-accent">Owner</span>}
                    </td>
                    <td className="px-5 py-3 text-slate">{role?.name ?? "--"}</td>
                    <td className="px-5 py-3 capitalize text-slate">{m.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-4 text-xs text-muted">
        Inviting new staff by email requires an admin invitation flow that isn&apos;t built in this pass --
        this view is read-only for now.
      </p>
    </div>
  );
}
