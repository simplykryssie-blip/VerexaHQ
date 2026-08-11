import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { Link2 } from "lucide-react";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { EmptyState } from "@/components/EmptyState";
import { ConnectionInviteGenerator } from "./ConnectionInviteGenerator";
import { ConnectedPtinRow } from "./ConnectedPtinRow";
import { RedeemConnectionForm } from "./RedeemConnectionForm";
import { MyConnectionStatus } from "./MyConnectionStatus";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage({ searchParams }: { searchParams: { token?: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const [{ data: canManage }, { data: connectedPtins }, { data: myConnectionRows }] = await Promise.all([
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "firm_connections.manage" }),
    supabase
      .from("firm_connections")
      .select("id, status, billing_responsibility, shares_communications_identity, created_at, workspaces:child_workspace_id(name)")
      .eq("parent_workspace_id", workspace.id)
      .eq("relationship_type", "ero_ptin")
      .order("created_at", { ascending: false }),
    supabase
      .from("firm_connections")
      .select("id, status, billing_responsibility, shares_communications_identity, workspaces:parent_workspace_id(name)")
      .eq("child_workspace_id", workspace.id)
      .eq("relationship_type", "ero_ptin")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const myConnection = (myConnectionRows ?? [])[0] ?? null;

  return (
    <div className="max-w-3xl space-y-10">
      <SettingsSectionHeader
        icon={Link2}
        title="Connections"
        description="Connect your firm to an ERO, or manage the PTINs connected to you."
      />

      {canManage && (
        <div>
          <h3 className="text-sm font-semibold text-ink">Connected PTINs</h3>
          <p className="mt-1 text-sm text-muted">
            PTINs connected to you can share a client&apos;s file with you once it&apos;s ready for filing, for your review and
            approval before it can go to e-file.
          </p>

          <div className="mt-3 rounded-xl border border-border bg-surface">
            {(connectedPtins ?? []).length === 0 ? (
              <EmptyState message="No PTINs connected yet." />
            ) : (
              <ul className="divide-y divide-border">
                {(connectedPtins ?? []).map((c) => (
                  <ConnectedPtinRow
                    key={c.id}
                    connectionId={c.id}
                    name={(c.workspaces as unknown as { name: string } | null)?.name ?? "Pending invite"}
                    status={c.status}
                    billingResponsibility={c.billing_responsibility}
                    sharesCommunicationsIdentity={c.shares_communications_identity}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4">
            <ConnectionInviteGenerator workspaceId={workspace.id} />
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-ink">Your ERO connection</h3>
        <p className="mt-1 text-sm text-muted">
          {myConnection
            ? "You're connected to an ERO. Sharing a client with them is available from that client's engagement page once it's ready for filing."
            : "If your PTIN works with an ERO, connect here using the invite link or code they send you."}
        </p>

        <div className="mt-3 rounded-xl border border-border bg-surface p-5">
          {myConnection ? (
            <MyConnectionStatus
              eroName={(myConnection.workspaces as unknown as { name: string } | null)?.name ?? "your ERO"}
              billingResponsibility={myConnection.billing_responsibility}
              sharesCommunicationsIdentity={myConnection.shares_communications_identity}
            />
          ) : (
            <RedeemConnectionForm workspaceId={workspace.id} initialToken={searchParams.token} />
          )}
        </div>
      </div>
    </div>
  );
}
