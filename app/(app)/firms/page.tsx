import { redirect } from "next/navigation";
import Link from "next/link";
import { Building2, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { isEroManagementTier } from "@/lib/workspaceCapabilities";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

const CHILD_RELATIONSHIP_TYPES_BY_WORKSPACE_TYPE: Record<string, string[]> = {
  ero_office: ["ero_ptin"],
  service_bureau: ["service_bureau_ero", "service_bureau_ptin"],
  multi_office_firm: ["ero_ptin"],
};

const CONNECTED_CHILD_TIER_LABEL: Record<string, string> = {
  ero_ptin: "PTIN",
  service_bureau_ero: "ERO",
  service_bureau_ptin: "PTIN",
};

// Firms connected to this workspace, as their own first-class section --
// separate from Clients, since a connected firm is a whole other workspace
// with its own clients/engagements/staff underneath it, not a client
// record. Only relevant for a workspace that can have firms connected
// under it (see isEroManagementTier()) -- Service Bureau gets exactly the
// same access as an ERO here, since it's the same capability tier, just
// bigger.
export default async function FirmsPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;
  if (!isEroManagementTier(workspace)) redirect("/dashboard");

  const supabase = createClient();
  const childRelationshipTypes = CHILD_RELATIONSHIP_TYPES_BY_WORKSPACE_TYPE[workspace.workspace_type] ?? [];

  const { data: connectedFirms } = childRelationshipTypes.length
    ? await supabase.rpc("get_ero_connected_partners", { p_workspace_id: workspace.id, p_relationship_types: childRelationshipTypes })
    : { data: [] as never[] };

  const firms = connectedFirms ?? [];

  return (
    <>
      <PageHeader title="Firms" description="Firms connected to you -- their info, production, package, and payout ledger." />
      <div className="flex-1 px-8 py-6">
        {firms.length === 0 ? (
          <EmptyState message="No firms connected yet. Invite one from Settings > Users & Staff." />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {firms.map((f) => (
              <Link
                key={f.connection_id}
                href={`/firms/${f.connection_id}`}
                className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 shadow-soft transition hover:shadow-softHover"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accentSoft text-accent">
                    <Building2 size={16} aria-hidden="true" />
                  </span>
                  <div>
                    <p className="font-medium text-slate">{f.name}</p>
                    <p className="text-xs text-muted">{CONNECTED_CHILD_TIER_LABEL[f.relationship_type] ?? "Firm"}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Badge tone={f.status === "active" ? "success" : "neutral"}>{f.status}</Badge>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-accent">
                    View <ArrowRight size={12} aria-hidden="true" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
