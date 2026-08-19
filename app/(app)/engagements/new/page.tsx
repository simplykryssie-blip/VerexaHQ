import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { NewEngagementForm } from "./NewEngagementForm";
import { isIndependentTier } from "@/lib/workspaceCapabilities";

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

  const [{ data: defaultClient }, { data: services }, { count: clientCount }, { data: billingRules }] = await Promise.all([
    searchParams.clientId
      ? supabase
          .from("clients")
          .select("id, first_name, last_name, business_name, client_type, primary_email")
          .eq("id", searchParams.clientId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("services")
      .select("id, name, organizer_template_id, billing_rule_id, organizer_templates(name), service_categories(slug)")
      .or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`)
      .eq("status", "published")
      .order("display_order"),
    supabase.from("clients").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id).is("merged_into_client_id", null),
    supabase
      .from("billing_rules")
      .select("id, name")
      .or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`)
      .eq("status", "published")
      .order("name"),
  ]);

  return (
    <>
      <PageHeader backHref="/engagements" backLabel="Back to Engagements" title="New Engagement" description="Start a new engagement for a client." />
      <div className="flex-1 px-8 py-6">
        <div className="max-w-lg rounded-2xl border border-border bg-surface shadow-soft p-6">
          <NewEngagementForm
            workspaceId={workspace.id}
            hasAnyClients={(clientCount ?? 0) > 0}
            defaultClient={defaultClient ?? null}
            services={services ?? []}
            billingRules={billingRules ?? []}
            autoAssignToSelf={isIndependentTier(workspace)}
          />
        </div>
      </div>
    </>
  );
}
