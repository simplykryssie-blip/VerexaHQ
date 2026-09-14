import { ClipboardList, Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHero, HeroHighlight } from "@/components/ui/PageHero";
import { EmptyState } from "@/components/EmptyState";
import { PartnerOnboardingApplication } from "@/components/partner/PartnerOnboardingApplication";
import type { DocumentRequestRow } from "@/components/documents/types";

export const dynamic = "force-dynamic";

// Phase 6J-2: the partner-facing onboarding application. Partner-initiated
// onboarding stays disabled (Phase 6J product decision) -- this page only
// ever operates on an onboarding record that already exists; there is no
// "Start Onboarding" control here, and create_partner_onboarding is never
// called from partner-facing code.
//
// Phase 6J-3: agreement and document status/actions, wired into the same
// page. Both reuse existing, already-authorized reads -- no new RLS, no
// new RPC beyond the Phase 6J-1 agreement-token lookup.
export default async function PartnerOnboardingApplicationPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();

  // Same connection check the main partner dashboard already uses -- a
  // workspace with no parent connection at all has nothing to onboard into.
  const { data: connections } = await supabase.rpc("get_my_ero_connection", { p_workspace_id: workspace.id });
  const connection = (connections ?? [])[0] ?? null;

  if (!connection) {
    return (
      <>
        <PageHero
          icon={ClipboardList}
          tone="emerald"
          heading={
            <>
              Your <HeroHighlight>onboarding application</HeroHighlight>.
            </>
          }
          subtitle="Complete and submit your partner onboarding application."
        />
        <div className="flex-1 px-8 py-6">
          <EmptyState icon={Building2} message="You're not connected to a parent firm yet." />
        </div>
      </>
    );
  }

  // get_my_partner_onboarding already re-verifies is_workspace_member and
  // returns only the caller's own most-recent onboarding record -- the
  // trusted identity-resolution path (Phase 6J-1/6J-2 security model). It
  // doesn't return application_data, so that one additional field is read
  // directly from partner_onboardings by id, which partner_onboardings_select's
  // existing RLS already permits for the connection's own child workspace
  // member -- no new backend access, no second source of truth.
  const { data: onboardingRows } = await supabase.rpc("get_my_partner_onboarding", { p_workspace_id: workspace.id });
  const onboarding = (onboardingRows ?? [])[0] ?? null;

  let applicationData: Record<string, unknown> | null = null;
  let agreementToken: string | null = null;
  let documentRequests: DocumentRequestRow[] = [];

  if (onboarding) {
    const { data: full } = await supabase.from("partner_onboardings").select("application_data").eq("id", onboarding.id).maybeSingle();
    applicationData = (full?.application_data as Record<string, unknown> | null) ?? null;

    // Agreement: only look up a token while there's actually something left
    // to sign -- once signed, get_my_partner_onboarding's own
    // agreement_signed flag is all the UI needs. Never surfaced for a
    // closed (rejected/withdrawn) onboarding.
    if (onboarding.agreement_required && !onboarding.agreement_signed && onboarding.status !== "rejected" && onboarding.status !== "withdrawn") {
      const { data: token } = await supabase.rpc("get_my_partner_onboarding_agreement_token", { p_workspace_id: workspace.id });
      agreementToken = (token as string | null) ?? null;
    }

    // Documents: the exact query shape the parent's own Firm Detail page
    // already uses for entity_type='firm_connection' -- reused verbatim,
    // now reachable for the partner too via Phase 6J-1's additive RLS.
    // Skipped entirely for a closed onboarding (no new submissions there).
    if (onboarding.documents_required && onboarding.status !== "rejected" && onboarding.status !== "withdrawn") {
      const { data: requestRows } = await supabase
        .from("document_requests")
        .select(`id, title, due_date, status, created_at, items:document_request_item_statuses(id, name, is_required, status, category, due_date)`)
        .eq("entity_type", "firm_connection")
        .eq("entity_id", connection.connection_id)
        .order("created_at", { ascending: false });
      documentRequests = (requestRows as unknown as DocumentRequestRow[] | null) ?? [];
    }
  }

  return (
    <>
      <PageHero
        icon={ClipboardList}
        tone="emerald"
        heading={
          <>
            Your <HeroHighlight>onboarding application</HeroHighlight>.
          </>
        }
        subtitle={`Complete and submit your partner onboarding application with ${connection.name}.`}
      />
      <div className="flex-1 px-8 py-6">
        {!onboarding ? (
          <EmptyState
            icon={ClipboardList}
            message={`Your onboarding application has not been started yet. Please contact ${connection.name} to begin the onboarding process.`}
          />
        ) : (
          <PartnerOnboardingApplication
            workspaceId={workspace.id}
            onboardingId={onboarding.id}
            status={onboarding.status}
            applicationData={applicationData}
            reviewNote={onboarding.review_note}
            rejectedReason={onboarding.rejected_reason}
            trainingRequired={onboarding.training_required}
            trainingCompletedAt={onboarding.training_completed_at}
            bankSoftwareSetupRequired={onboarding.bank_software_setup_required}
            bankSoftwareSetupCompletedAt={onboarding.bank_software_setup_completed_at}
            agreementRequired={onboarding.agreement_required}
            agreementSigned={onboarding.agreement_signed}
            agreementToken={agreementToken}
            documentsRequired={onboarding.documents_required}
            documentsCompleted={onboarding.documents_completed}
            documentRequests={documentRequests}
            parentWorkspaceId={connection.ero_workspace_id}
            firmConnectionId={connection.connection_id}
          />
        )}
      </div>
    </>
  );
}
