import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { isEroManagementTier, isServiceBureauTier } from "@/lib/workspaceCapabilities";
import { CHILD_RELATIONSHIP_TYPES_BY_WORKSPACE_TYPE, CONNECTED_CHILD_TIER_LABEL } from "@/lib/firmConnections";
import { getWorkspaceMemberWorkload } from "@/lib/workspaceStaff";
import { ConnectedPtinRow } from "@/app/(app)/settings/connections/ConnectedPtinRow";
import { FirmDetailClient } from "@/components/firms/FirmDetailClient";
import { EmptyState } from "@/components/EmptyState";
import type { DocumentFolderRow, DocumentRow } from "@/components/documents/types";

export const dynamic = "force-dynamic";

export default async function FirmDetailPage({ params }: { params: { id: string } }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;
  if (!isEroManagementTier(workspace)) redirect("/dashboard");

  const supabase = createClient();
  // Same permission the Firms list page and Settings > Users & Staff already
  // require -- this detail page is the one that actually shows the connected
  // firm's payout ledger and production numbers, so it needs the check too.
  const { data: canView } = await supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "firm_connections.manage" });
  if (!canView) {
    return (
      <div className="max-w-4xl px-8 py-6">
        <Link href="/firms" className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-ink">
          <ArrowLeft size={14} aria-hidden="true" /> Back to Firms
        </Link>
        <EmptyState icon={Lock} message="You don't have permission to view connected firms." />
      </div>
    );
  }

  const childRelationshipTypes = CHILD_RELATIONSHIP_TYPES_BY_WORKSPACE_TYPE[workspace.workspace_type] ?? [];

  const [{ data: connectedFirms }, { members }, { data: packages }, { data: banks }, { data: softwareList }] = await Promise.all([
    childRelationshipTypes.length
      ? supabase.rpc("get_ero_connected_partners", { p_workspace_id: workspace.id, p_relationship_types: childRelationshipTypes })
      : Promise.resolve({ data: [] as never[] }),
    getWorkspaceMemberWorkload(supabase, workspace.id),
    supabase.from("firm_packages").select("id, name").eq("workspace_id", workspace.id).eq("status", "published").order("name"),
    supabase.from("bank_partners").select("id, name").eq("workspace_id", workspace.id).eq("is_active", true).order("name"),
    supabase.from("software_partners").select("id, name").eq("workspace_id", workspace.id).eq("is_active", true).order("name"),
  ]);

  const firm = (connectedFirms ?? []).find((f) => f.connection_id === params.id);
  if (!firm) notFound();

  // The "filed under" picker only makes sense for a PTIN connection, offered
  // against this same parent's other connected EROs -- for a service bureau,
  // connectedFirms already has both types in one list (see
  // CHILD_RELATIONSHIP_TYPES_BY_WORKSPACE_TYPE), so no extra query is needed.
  const eroOptions = (connectedFirms ?? [])
    .filter((f) => f.relationship_type === "service_bureau_ero" && f.connection_id !== firm.connection_id)
    .map((f) => ({ id: f.connection_id, name: f.name }));

  const reviewerOptions = members.map((m) => ({ id: m.user_id, display_name: m.display_name }));

  const [{ data: production }, { data: payouts }, { data: contacts }, { data: attachments }, { data: folders }] = await Promise.all([
    firm.status === "active" && firm.child_workspace_id
      ? supabase.rpc("get_firm_production", { p_connection_id: firm.connection_id })
      : Promise.resolve({ data: null }),
    supabase
      .from("firm_payouts")
      .select(
        "id, period_start, period_end, gross_prep_fees, gross_bank_product_rebates, gross_bank_fees, gross_addon_fees, gross_transmission_fees, gross_paperwork_fees, ero_share_amount, amount_owed_to_ptin, status, paid_at"
      )
      .eq("connection_id", firm.connection_id)
      .order("period_start", { ascending: false }),
    supabase
      .from("firm_connection_contacts")
      .select("id, first_name, last_name, title, email, phone, is_primary")
      .eq("connection_id", firm.connection_id)
      .order("display_order"),
    supabase
      .from("attachments")
      .select("id, file_name, storage_path, category, tags, version, mime_type, file_size_bytes, folder_id, is_favorite, is_archived, is_locked, visibility, created_at, uploaded_by")
      .eq("entity_type", "firm_connection")
      .eq("entity_id", firm.connection_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("document_folders")
      .select("id, name, parent_folder_id, display_order")
      .eq("entity_type", "firm_connection")
      .eq("entity_id", firm.connection_id)
      .order("display_order"),
  ]);

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, description, priority, due_date, status")
    .eq("firm_connection_id", firm.connection_id)
    .order("due_date", { ascending: true, nullsFirst: false });

  const staffById = new Map(members.map((m) => [m.user_id, { id: m.user_id, display_name: m.display_name }]));
  const documents: DocumentRow[] = (attachments ?? []).map((d) => ({
    ...d,
    uploaded_by: d.uploaded_by ? staffById.get(d.uploaded_by) ?? null : null,
  }));
  const documentFolders: DocumentFolderRow[] = folders ?? [];

  return (
    <div className="max-w-4xl px-8 py-6">
      <Link href="/firms" className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-ink">
        <ArrowLeft size={14} aria-hidden="true" /> Back to Firms
      </Link>
      <h1 className="font-display text-lg font-semibold text-ink">
        {firm.name} <span className="text-sm font-normal text-muted">({CONNECTED_CHILD_TIER_LABEL[firm.relationship_type] ?? "Firm"})</span>
      </h1>

      <FirmDetailClient
        connectionId={firm.connection_id}
        parentWorkspaceId={workspace.id}
        relationshipType={firm.relationship_type}
        source={firm.source}
        firmInfo={{
          name: firm.name,
          ownerName: firm.owner_name,
          phone: firm.phone,
          primaryContactEmail: firm.primary_contact_email,
          website: firm.website,
          mailingAddress: firm.mailing_address,
        }}
        canAssignPackages={isServiceBureauTier(workspace)}
        packageId={firm.package_id}
        packages={packages ?? []}
        revenueSharePercent={firm.revenue_share_percent}
        revenueShareScope={firm.revenue_share_scope}
        bankPartnerId={firm.bank_partner_id}
        banks={banks ?? []}
        softwarePartnerId={firm.software_partner_id}
        softwareList={softwareList ?? []}
        partnerSoftwareUsed={firm.partner_software_used ?? []}
        partnerTaxPrograms={firm.partner_tax_programs ?? []}
        notes={firm.notes}
        efinLast4={firm.efin_last4}
        ptinLast4={firm.ptin_last4}
        onboardingStage={firm.onboarding_stage}
        preparerCredential={firm.preparer_credential}
        filedUnderConnectionId={firm.filed_under_connection_id}
        eroOptions={eroOptions}
        downstreamPtinCount={firm.downstream_ptin_count}
        production={production as Record<string, unknown> | null}
        payouts={payouts ?? []}
        isActive={firm.status === "active"}
        contacts={contacts ?? []}
        workspaceId={workspace.id}
        documentFolders={documentFolders}
        documents={documents}
        firmName={workspace.name}
        tasks={tasks ?? []}
        staffOptions={reviewerOptions}
      />

      {firm.status === "active" && firm.source !== "manual" && (
        <div className="mt-8 border-t border-border pt-6">
          <h2 className="font-display text-sm font-semibold text-ink">Connection settings</h2>
          <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-surface shadow-soft">
            <ConnectedPtinRow
              connectionId={firm.connection_id}
              name={firm.name}
              tierLabel={CONNECTED_CHILD_TIER_LABEL[firm.relationship_type] ?? "firm"}
              relationshipType={firm.relationship_type}
              status={firm.status}
              billingResponsibility={firm.billing_responsibility}
              sharesCommunicationsIdentity={firm.shares_communications_identity}
              allowsBrandingOverride={firm.allows_branding_override}
              defaultReviewerId={firm.default_reviewer_id ?? null}
              restrictPtinStaffAssignment={Boolean(firm.restrict_ptin_staff_assignment)}
              allowsLearningHubDownlineShare={Boolean(firm.allows_learning_hub_downline_share)}
              reviewerOptions={reviewerOptions}
            />
          </ul>
        </div>
      )}
    </div>
  );
}
