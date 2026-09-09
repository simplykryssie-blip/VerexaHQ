import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { getIrs8821OrganizerPrefill } from "@/lib/organizerPrefill8821";
import { NewIrsAuthorizationForm } from "./NewIrsAuthorizationForm";

export const dynamic = "force-dynamic";

function clientDisplayName(c: { client_type: string; first_name: string | null; last_name: string | null; business_name: string | null }) {
  if (c.client_type === "business" && c.business_name) return c.business_name;
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed client";
}

export default async function NewIrsAuthorizationPage({ params }: { params: { id: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: canManage } = await supabase.rpc("has_permission", {
    p_workspace_id: workspace.id,
    p_permission_key: "irs_authorizations.manage",
  });
  if (!canManage) {
    return (
      <>
        <PageHeader backHref={`/clients/${params.id}`} backLabel="Back to client" title="New IRS Authorization" />
        <div className="flex-1 px-8 py-6">
          <EmptyState message="You don't have permission to create IRS authorizations." />
        </div>
      </>
    );
  }

  const [{ data: client }, { data: engagementRows }, { data: workspaceUsers }, { data: templates }, { data: contact }, { data: branding }, prefill] =
    await Promise.all([
      supabase
        .from("clients")
        .select("id, client_type, first_name, last_name, business_name, primary_email, address_line1, address_line2, city, state, postal_code")
        .eq("id", params.id)
        .single(),
      supabase
        .from("engagements")
        .select("id, engagement_number, engagement_tax_details(tax_year)")
        .eq("workspace_id", workspace.id)
        .eq("client_id", params.id)
        .order("created_at", { ascending: false }),
      supabase.from("workspace_users").select("user_id").eq("workspace_id", workspace.id).eq("status", "active"),
      supabase
        .from("engagement_letter_templates")
        .select("id, name")
        .eq("workspace_id", workspace.id)
        .eq("source_type", "pdf")
        .not("pdf_field_mode", "is", null)
        .order("name"),
      supabase.from("workspaces").select("name, phone, mailing_address").eq("id", workspace.id).single(),
      supabase.from("branding").select("support_phone").eq("workspace_id", workspace.id).maybeSingle(),
      getIrs8821OrganizerPrefill(supabase, params.id),
    ]);

  if (!client) return null;

  const userIds = Array.from(new Set((workspaceUsers ?? []).map((u) => u.user_id)));
  const { data: profiles } = userIds.length
    ? await supabase.from("user_profiles").select("id, display_name, first_name, last_name, caf_number").in("id", userIds)
    : { data: [] };
  const staffOptions = (profiles ?? []).map((p) => ({
    id: p.id,
    name: p.display_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || "Staff member",
    cafNumber: p.caf_number,
  }));

  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  const engagements = (engagementRows ?? []).map((e) => ({
    id: e.id,
    label: e.engagement_number ?? "Engagement",
    taxYear: (e.engagement_tax_details as unknown as { tax_year: number | null }[] | null)?.[0]?.tax_year ?? null,
  }));

  const clientAddress = [client.address_line1, client.address_line2, client.city, client.state, client.postal_code].filter(Boolean).join(", ");

  return (
    <>
      <PageHeader backHref={`/clients/${client.id}`} backLabel={`Back to ${clientDisplayName(client)}`} title="New IRS Authorization" />
      <div className="flex-1 px-8 py-6">
        <div className="max-w-2xl rounded-2xl border border-border bg-surface shadow-soft p-6">
          <NewIrsAuthorizationForm
            workspaceId={workspace.id}
            clientId={client.id}
            clientName={clientDisplayName(client)}
            clientEmail={client.primary_email}
            clientAddress={clientAddress}
            defaultTaxpayerType={client.client_type === "business" ? "business" : "individual"}
            engagements={engagements}
            staffOptions={staffOptions}
            templates={templates ?? []}
            firmName={workspace.name}
            firmAddress={contact?.mailing_address ?? ""}
            firmPhone={branding?.support_phone ?? contact?.phone ?? ""}
            organizerPrefill={prefill}
            currentUserId={currentUser?.id ?? null}
          />
        </div>
      </div>
    </>
  );
}
