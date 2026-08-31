import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { Link2 } from "lucide-react";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { EmptyState } from "@/components/EmptyState";
import { ConnectionInviteGenerator } from "./ConnectionInviteGenerator";
import { ConnectedPtinRow } from "./ConnectedPtinRow";
import { RedeemConnectionForm } from "./RedeemConnectionForm";
import { MyConnectionStatus } from "./MyConnectionStatus";
import { PeerMessagingToggle } from "./PeerMessagingToggle";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage({ searchParams }: { searchParams: { token?: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  // Both of these go through SECURITY DEFINER RPCs rather than a plain
  // embedded select -- the other side's workspace name/contact info isn't
  // visible under workspaces' own RLS (is_workspace_member(id)) unless the
  // viewer happens to also belong to that workspace, which is only true for
  // the demo accounts. See get_ero_connected_partners/get_my_ero_connection.
  const [{ data: canManage }, { data: connectedPtins }, { data: myConnectionRows }, { data: workspaceRow }] = await Promise.all([
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "firm_connections.manage" }),
    supabase.rpc("get_ero_connected_partners", { p_workspace_id: workspace.id }),
    supabase.rpc("get_my_ero_connection", { p_workspace_id: workspace.id }),
    supabase.from("workspaces").select("allow_connected_ptin_messaging").eq("id", workspace.id).maybeSingle(),
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

          <div className="mt-3 rounded-2xl border border-border bg-surface shadow-soft">
            {(connectedPtins ?? []).length === 0 ? (
              <EmptyState message="No PTINs connected yet." />
            ) : (
              <ul className="divide-y divide-border">
                {(connectedPtins ?? []).map((c) => (
                  <ConnectedPtinRow
                    key={c.connection_id}
                    connectionId={c.connection_id}
                    name={c.name}
                    status={c.status}
                    billingResponsibility={c.billing_responsibility}
                    sharesCommunicationsIdentity={c.shares_communications_identity}
                    allowsBrandingOverride={c.allows_branding_override}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4">
            <ConnectionInviteGenerator workspaceId={workspace.id} />
          </div>
          <div className="mt-4 border-t border-border pt-4">
            <PeerMessagingToggle workspaceId={workspace.id} initialAllowed={Boolean(workspaceRow?.allow_connected_ptin_messaging)} />
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

        <div className="mt-3 rounded-2xl border border-border bg-surface shadow-soft p-5">
          {myConnection ? (
            <MyConnectionStatus
              connectionId={myConnection.connection_id}
              eroName={myConnection.name}
              billingResponsibility={myConnection.billing_responsibility}
              sharesCommunicationsIdentity={myConnection.shares_communications_identity}
              allowsBrandingOverride={myConnection.allows_branding_override}
              canDisconnect={Boolean(canManage) && myConnection.billing_responsibility !== "ero"}
            />
          ) : (
            <RedeemConnectionForm workspaceId={workspace.id} initialToken={searchParams.token} />
          )}
        </div>
      </div>
    </div>
  );
}
