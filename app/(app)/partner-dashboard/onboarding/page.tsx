import { ClipboardList, Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHero, HeroHighlight } from "@/components/ui/PageHero";
import { EmptyState } from "@/components/EmptyState";
import { PartnerOnboardingApplication } from "@/components/partner/PartnerOnboardingApplication";

export const dynamic = "force-dynamic";

// Phase 6J-2: the partner-facing onboarding application. Partner-initiated
// onboarding stays disabled (Phase 6J product decision) -- this page only
// ever operates on an onboarding record that already exists; there is no
// "Start Onboarding" control here, and create_partner_onboarding is never
// called from partner-facing code. Agreement and document UI are Phase
// 6J-3 -- not built here.
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
  if (onboarding) {
    const { data: full } = await supabase.from("partner_onboardings").select("application_data").eq("id", onboarding.id).maybeSingle();
    applicationData = (full?.application_data as Record<string, unknown> | null) ?? null;
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
          />
        )}
      </div>
    </>
  );
}
