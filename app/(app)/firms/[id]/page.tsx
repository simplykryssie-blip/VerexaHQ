import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { isEroManagementTier, isServiceBureauTier } from "@/lib/workspaceCapabilities";
import { CHILD_RELATIONSHIP_TYPES_BY_WORKSPACE_TYPE, CONNECTED_CHILD_TIER_LABEL } from "@/lib/firmConnections";
import { getWorkspaceMemberWorkload } from "@/lib/workspaceStaff";
import { loadActionPermissions } from "@/lib/actionPermissions";
import { ConnectedPtinRow } from "@/app/(app)/settings/connections/ConnectedPtinRow";
import { FirmDetailClient } from "@/components/firms/FirmDetailClient";
import { EmptyState } from "@/components/EmptyState";
import type { DocumentFolderRow, DocumentRow, DocumentRequestRow, SignatureRequestRow, DocumentRequestTemplateOption } from "@/components/documents/types";
import type { OnboardingRecord, OnboardingWorkflowInfo } from "@/components/firms/OnboardingSection";

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

  const { data: firmInvoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, total_amount, amount_paid, status, due_date")
    .eq("firm_connection_id", firm.connection_id)
    .order("created_at", { ascending: false });

  // Phase 6C: the actual onboarding record (Phase 6B's own list RPC already
  // re-verifies is_workspace_admin and returns every connection's row in one
  // call -- reused as-is rather than adding a per-connection RPC).
  const [{ data: onboardings }, { data: isWorkspaceAdmin }] = await Promise.all([
    supabase.rpc("list_partner_onboardings", { p_workspace_id: workspace.id }),
    supabase.rpc("is_workspace_admin", { p_workspace_id: workspace.id }),
  ]);
  const onboardingSummary = (onboardings ?? []).find((o) => o.firm_connection_id === firm.connection_id) ?? null;

  const [{ data: onboardingDetail }, { data: documentRequestTemplateRows }, permissions] = await Promise.all([
    onboardingSummary
      ? supabase
          .from("partner_onboardings")
          .select("id, application_data, review_note, rejected_reason")
          .eq("id", onboardingSummary.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("document_request_templates").select("id, name").eq("workspace_id", workspace.id).eq("status", "published").order("name"),
    loadActionPermissions(supabase, workspace.id),
  ]);

  // Fix (Phase 6C, audit section 12/14): FirmDetailClient previously passed
  // requests={[]}/signatureRequests={[]}/canRequestDocuments={false}/
  // canRequestSignatures={false} to DocumentWorkspace unconditionally --
  // nothing rendered a firm connection's document/signature requests
  // anywhere. Mirrors the exact query shape engagements/[id]/page.tsx
  // already uses for the same two tables.
  const { data: documentRequestRows } = await supabase
    .from("document_requests")
    .select(
      `id, title, due_date, status, created_at, document_request_template_id,
      items:document_request_item_statuses(id, name, is_required, status, category, due_date)`
    )
    .eq("entity_type", "firm_connection")
    .eq("entity_id", firm.connection_id)
    .order("created_at", { ascending: false });

  const connectionDocumentIds = (attachments ?? []).map((d) => d.id);
  const { data: signatureRequestRows } =
    connectionDocumentIds.length > 0
      ? await supabase
          .from("signature_requests")
          .select(
            `id, title, status, due_date, attachment_id, created_at,
            attachment:attachments!signature_requests_attachment_id_fkey(file_name),
            signers:signature_request_signers(id, signer_name, signer_email, status, signed_at, access_token, attested_at, expires_at,
              attested_by_profile:user_profiles!signature_request_signers_attested_by_fkey(display_name))`
          )
          .in("attachment_id", connectionDocumentIds)
          .order("created_at", { ascending: false })
      : { data: [] as never[] };

  const documentRequests: DocumentRequestRow[] = (documentRequestRows ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    due_date: r.due_date,
    status: r.status as DocumentRequestRow["status"],
    created_at: r.created_at,
    items: (r.items ?? []) as DocumentRequestRow["items"],
  }));

  const signatureRequests: SignatureRequestRow[] = (signatureRequestRows ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status as SignatureRequestRow["status"],
    due_date: r.due_date,
    attachment_id: r.attachment_id,
    attachment_file_name: (r.attachment as { file_name?: string } | null)?.file_name ?? "Document",
    created_at: r.created_at,
    signers: (r.signers ?? []).map((s) => ({
      ...s,
      attested_by_name: (s.attested_by_profile as { display_name?: string } | null)?.display_name ?? null,
    })) as SignatureRequestRow["signers"],
  }));

  const documentRequestTemplates: DocumentRequestTemplateOption[] = documentRequestTemplateRows ?? [];

  // Informational workflow strip (audit section 20/23) -- read-only, links
  // out to the existing Workflows editor. Never touches marketplace_templates
  // or a master automation.
  const { data: onboardingAutomations } = await supabase
    .from("automations")
    .select("id, name, is_enabled, status, trigger_type")
    .eq("workspace_id", workspace.id)
    .in("trigger_type", ["partner_onboarding.created", "partner_onboarding.status_changed"]);

  const automationIds = (onboardingAutomations ?? []).map((a) => a.id);
  const { data: installRows } =
    automationIds.length > 0
      ? await supabase
          .from("workspace_template_installations")
          .select("copy_object_id, installed_version, marketplace_templates(version)")
          .in("copy_object_id", automationIds)
      : { data: [] as never[] };
  const installByAutomationId = new Map(
    (installRows ?? []).map((r) => [r.copy_object_id, { installedVersion: r.installed_version, masterVersion: (r.marketplace_templates as { version?: number } | null)?.version ?? null }])
  );

  const workflows: OnboardingWorkflowInfo[] = (onboardingAutomations ?? []).map((a) => {
    const install = installByAutomationId.get(a.id);
    return {
      id: a.id,
      name: a.name,
      is_enabled: a.is_enabled,
      status: a.status,
      trigger_type: a.trigger_type,
      update_available: Boolean(install && install.masterVersion != null && install.installedVersion < install.masterVersion),
    };
  });

  const staffById = new Map(members.map((m) => [m.user_id, { id: m.user_id, display_name: m.display_name }]));
  const documents: DocumentRow[] = (attachments ?? []).map((d) => ({
    ...d,
    uploaded_by: d.uploaded_by ? staffById.get(d.uploaded_by) ?? null : null,
  }));
  const documentFolders: DocumentFolderRow[] = folders ?? [];

  const defaultReviewerName = firm.default_reviewer_id ? staffById.get(firm.default_reviewer_id)?.display_name ?? null : null;

  const onboarding: OnboardingRecord | null = onboardingSummary
    ? {
        id: onboardingSummary.id,
        status: onboardingSummary.status,
        agreement_required: onboardingSummary.agreement_required,
        documents_required: onboardingSummary.documents_required,
        training_required: onboardingSummary.training_required,
        bank_software_setup_required: onboardingSummary.bank_software_setup_required,
        application_submitted_at: onboardingSummary.application_submitted_at,
        agreement_signed: onboardingSummary.agreement_signed,
        documents_completed: onboardingSummary.documents_completed,
        training_completed_at: onboardingSummary.training_completed_at,
        bank_software_setup_completed_at: onboardingSummary.bank_software_setup_completed_at,
        created_at: onboardingSummary.created_at,
        updated_at: onboardingSummary.updated_at,
        completed_at: onboardingSummary.completed_at,
        package_name: onboardingSummary.package_name,
        application_data: (onboardingDetail?.application_data as Record<string, unknown> | null) ?? null,
        review_note: onboardingDetail?.review_note ?? null,
        rejected_reason: onboardingDetail?.rejected_reason ?? null,
      }
    : null;

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
        documentRequests={documentRequests}
        documentRequestTemplates={documentRequestTemplates}
        signatureRequests={signatureRequests}
        canRequestDocuments={permissions.documentsRequest}
        canRequestSignatures={permissions.signaturesRequest}
        firmName={workspace.name}
        tasks={tasks ?? []}
        staffOptions={reviewerOptions}
        invoices={firmInvoices ?? []}
        onboarding={onboarding}
        canManageOnboarding={Boolean(isWorkspaceAdmin)}
        defaultReviewerName={defaultReviewerName}
        onboardingWorkflows={workflows}
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
