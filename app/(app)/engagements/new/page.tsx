import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { NewEngagementForm } from "./NewEngagementForm";

export const dynamic = 'force-dynamic';

export default async function NewEngagementPage({
  searchParams,
}: {
  searchParams: { clientId?: string };
}) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: canCreate } = await supabase.rpc("has_permission", {
    p_workspace_id: workspace.id,
    p_permission_key: "engagements.manage",
  });
  if (!canCreate) {
    return (
      <>
        <PageHeader backHref="/engagements" backLabel="Back to Engagements" title="New Engagement" description="Start a new engagement for a client." />
        <div className="flex-1 px-8 py-6">
          <EmptyState message="You don't have permission to create engagements." />
        </div>
      </>
    );
  }

  const [{ data: clients }, { data: engagementTypes }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, first_name, last_name, business_name, client_type")
      .eq("workspace_id", workspace.id)
      .is("merged_into_client_id", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("engagement_types")
      .select("id, name")
      .or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`)
      .eq("status", "published")
      .order("display_order"),
  ]);

  return (
    <>
      <PageHeader backHref="/engagements" backLabel="Back to Engagements" title="New Engagement" description="Start a new engagement for a client." />
      <div className="flex-1 px-8 py-6">
        <div className="max-w-lg rounded-xl border border-border bg-surface p-6">
          <NewEngagementForm
            workspaceId={workspace.id}
            clients={clients ?? []}
            engagementTypes={engagementTypes ?? []}
            defaultClientId={searchParams.clientId}
            autoAssignToSelf={workspace.workspace_type === "independent_ptin"}
          />
        </div>
      </div>
    </>
  );
}
