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

// firm_connections supports three tiers (ero_ptin, service_bureau_ero,
// service_bureau_ptin) but a workspace can only ever invite the tier
// directly below its own -- an ERO invites PTINs, a Service Bureau invites
// EROs or PTINs directly. Independent PTINs and multi-office firms have no
// tier below them, so they get no invite generator at all.
const CHILD_RELATIONSHIP_TYPES_BY_WORKSPACE_TYPE: Record<string, string[]> = {
  ero_office: ["ero_ptin"],
  service_bureau: ["service_bureau_ero", "service_bureau_ptin"],
};

const CONNECTED_CHILD_TIER_LABEL: Record<string, string> = {
  ero_ptin: "PTIN",
  service_bureau_ero: "ERO",
  service_bureau_ptin: "PTIN",
};

const PARENT_TIER_LABEL: Record<string, string> = {
  ero_ptin: "ERO",
  service_bureau_ero: "Service Bureau",
  service_bureau_ptin: "Service Bureau",
};

export default async function ConnectionsPage({ searchParams }: { searchParams: { token?: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const childRelationshipTypes = CHILD_RELATIONSHIP_TYPES_BY_WORKSPACE_TYPE[workspace.workspace_type] ?? [];

  const [{ data: canManage }, { data: connectedChildren }, { data: myConnectionRows }, { data: workspaceRow }] = await Promise.all([
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "firm_connections.manage" }),
    childRelationshipTypes.length > 0
      ? supabase
          .from("firm_connections")
          .select(
            "id, status, relationship_type, billing_responsibility, shares_communications_identity, allows_branding_override, created_at, workspaces:child_workspace_id(name)"
          )
          .eq("parent_workspace_id", workspace.id)
          .in("relationship_type", childRelationshipTypes)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as never[] }),
    supabase
      .from("firm_connections")
      .select("id, status, relationship_type, billing_responsibility, shares_communications_identity, allows_branding_override, workspaces:parent_workspace_id(name)")
      .eq("child_workspace_id", workspace.id)
      .in("relationship_type", ["ero_ptin", "service_bureau_ero", "service_bureau_ptin"])
      .order("created_at", { ascending: false })
      .limit(1),
    supabase.from("workspaces").select("allow_connected_ptin_messaging").eq("id", workspace.id).maybeSingle(),
  ]);

  const myConnection = (myConnectionRows ?? [])[0] ?? null;
  const myConnectionParentLabel = myConnection ? PARENT_TIER_LABEL[myConnection.relationship_type] ?? "firm" : null;
  const canInvite = childRelationshipTypes.length > 0;

  return (
    <div className="max-w-3xl space-y-10">
      <SettingsSectionHeader
        icon={Link2}
        title="Connections"
        description="Connect your firm to an ERO or Service Bureau, or manage the firms connected to you."
      />

      {canManage && canInvite && (
        <div>
          <h3 className="text-sm font-semibold text-ink">Connected firms</h3>
          <p className="mt-1 text-sm text-muted">
            Firms connected to you can share a client&apos;s file with you once it&apos;s ready for filing, for your review and
            approval before it can go to e-file.
          </p>

          <div className="mt-3 rounded-2xl border border-border bg-surface shadow-soft">
            {(connectedChildren ?? []).length === 0 ? (
              <EmptyState message="No firms connected yet." />
            ) : (
              <ul className="divide-y divide-border">
                {(connectedChildren ?? []).map((c) => (
                  <ConnectedPtinRow
                    key={c.id}
                    connectionId={c.id}
                    name={(c.workspaces as unknown as { name: string } | null)?.name ?? "Pending invite"}
                    tierLabel={CONNECTED_CHILD_TIER_LABEL[c.relationship_type] ?? "firm"}
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
            <ConnectionInviteGenerator workspaceId={workspace.id} availableRelationshipTypes={childRelationshipTypes} />
          </div>
          <div className="mt-4 border-t border-border pt-4">
            <PeerMessagingToggle workspaceId={workspace.id} initialAllowed={Boolean(workspaceRow?.allow_connected_ptin_messaging)} />
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-ink">Your {myConnectionParentLabel ?? "ERO/Service Bureau"} connection</h3>
        <p className="mt-1 text-sm text-muted">
          {myConnection
            ? `You're connected to a ${myConnectionParentLabel}. Sharing a client with them is available from that client's engagement page once it's ready for filing.`
            : "If your firm works with an ERO or Service Bureau, connect here using the invite link or code they send you."}
        </p>

        <div className="mt-3 rounded-2xl border border-border bg-surface shadow-soft p-5">
          {myConnection ? (
            <MyConnectionStatus
              connectionId={myConnection.id}
              parentName={(myConnection.workspaces as unknown as { name: string } | null)?.name ?? `your ${myConnectionParentLabel}`}
              parentTierLabel={myConnectionParentLabel ?? "firm"}
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
