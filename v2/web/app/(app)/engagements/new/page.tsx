import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { NewEngagementForm } from "./NewEngagementForm";

export default async function NewEngagementPage({
  searchParams,
}: {
  searchParams: { clientId?: string };
}) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
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
      <PageHeader title="New Engagement" description="Start a new engagement for a client." />
      <div className="flex-1 px-8 py-6">
        <div className="max-w-lg rounded-xl border border-border bg-surface p-6">
          <NewEngagementForm
            workspaceId={workspace.id}
            clients={clients ?? []}
            engagementTypes={engagementTypes ?? []}
            defaultClientId={searchParams.clientId}
          />
        </div>
      </div>
    </>
  );
}
