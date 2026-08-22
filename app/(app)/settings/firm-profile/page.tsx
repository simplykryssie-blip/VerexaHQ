import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { Building2, FileText } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { SettingsCard } from "@/components/settings/SettingsCard";
import { DEFAULT_BUSINESS_HOURS, DEFAULT_SLOT_MINUTES, type BusinessHours } from "@/lib/businessHours";
import { FirmProfileForm } from "./FirmProfileForm";
import { getEffectiveBranding } from "@/lib/branding";

export const dynamic = 'force-dynamic';

const EFIN_WORKSPACE_TYPES = new Set(["ero_office", "service_bureau", "multi_office_firm"]);

export default async function FirmProfilePage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: profile },
    { data: contact },
    { data: branding },
    { data: settings },
    effectiveBranding,
    { data: myProfile },
    { data: isAdmin },
    { data: canManageSettings },
  ] = await Promise.all([
      supabase
        .from("firm_tax_profile")
        .select("ein_last4, efin_last4, ptin_last4, supported_filing_states, updated_at")
        .eq("workspace_id", workspace.id)
        .maybeSingle(),
      supabase
        .from("workspaces")
        .select("phone, website, mailing_address, primary_contact_email")
        .eq("id", workspace.id)
        .single(),
      supabase
        .from("branding")
        .select("display_name, sidebar_logo_url, primary_color, secondary_color, support_email, support_phone")
        .eq("workspace_id", workspace.id)
        .maybeSingle(),
      supabase.from("system_settings").select("key, value, updated_at").eq("workspace_id", workspace.id).order("key"),
      getEffectiveBranding(workspace.id),
      user
        ? supabase.from("user_profiles").select("first_name, last_name, display_name, avatar_url, phone, ptin_last4").eq("id", user.id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "workspace.manage" }),
      supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "settings.manage" }),
    ]);

  const showEfin = EFIN_WORKSPACE_TYPES.has(workspace.workspace_type);
  // PTIN belongs to whichever entity the workspace actually represents: for a
  // solo preparer the workspace IS them, so it's a firm-level field; for an
  // ERO/SB, each individual staff member holds their own PTIN, so it's a
  // personal field on their own profile instead.
  const showFirmPtin = workspace.workspace_type === "independent_ptin";
  const showStaffPtin = !showFirmPtin;

  const businessHours = (settings?.find((s) => s.key === "business_hours")?.value as BusinessHours | undefined) ?? DEFAULT_BUSINESS_HOURS;
  const slotMinutes = (settings?.find((s) => s.key === "booking_slot_minutes")?.value as number | undefined) ?? DEFAULT_SLOT_MINUTES;

  return (
    <div className="max-w-2xl">
      <SettingsSectionHeader
        icon={Building2}
        title="Firm Profile"
        description="Your profile, your firm's identity, and your workspace preferences -- all in one place, one Save."
      />

      {user && (
        <div className="mt-6">
          <FirmProfileForm
            userId={user.id}
            workspaceId={workspace.id}
            firstName={myProfile?.first_name ?? null}
            lastName={myProfile?.last_name ?? null}
            displayName={myProfile?.display_name ?? null}
            avatarUrl={myProfile?.avatar_url ?? null}
            personalPhone={myProfile?.phone ?? null}
            showPtin={showStaffPtin}
            ptinLast4={myProfile?.ptin_last4 ?? null}
            businessName={branding?.display_name ?? null}
            website={contact?.website ?? null}
            mailingAddress={contact?.mailing_address ?? null}
            businessPhone={branding?.support_phone ?? contact?.phone ?? null}
            businessEmail={branding?.support_email ?? contact?.primary_contact_email ?? null}
            logoUrl={branding?.sidebar_logo_url ?? null}
            primaryColor={branding?.primary_color ?? "#0F172A"}
            secondaryColor={branding?.secondary_color ?? "#2563EB"}
            isWhitelabeledByEro={effectiveBranding.isWhitelabeledByEro}
            eroName={effectiveBranding.eroName ?? null}
            isOwner={workspace.is_owner}
            isAdmin={Boolean(isAdmin)}
            canManageSettings={Boolean(canManageSettings)}
            showEin
            showEfin={showEfin}
            showFirmPtin={showFirmPtin}
            einLast4={profile?.ein_last4 ?? null}
            efinLast4={profile?.efin_last4 ?? null}
            firmPtinLast4={profile?.ptin_last4 ?? null}
            supportedFilingStates={profile?.supported_filing_states ?? []}
            initialHours={businessHours}
            initialSlotMinutes={slotMinutes}
          />
        </div>
      )}

      {!isAdmin && (
        <div className="mt-6 max-w-2xl">
          <SettingsCard
            title="Tax identifiers"
            description="EIN, EFIN, and PTIN are encrypted at rest -- only the last 4 digits are ever shown by default, and revealing the full value is audit-logged. Only a workspace admin can edit these."
          >
            {!profile ? (
              <EmptyState icon={FileText} message="No firm tax profile set up yet." />
            ) : (
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">EIN</dt>
                  <dd className="mt-0.5 text-slate">{profile.ein_last4 ? `••••${profile.ein_last4}` : "Not set"}</dd>
                </div>
                {showEfin && (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted">EFIN</dt>
                    <dd className="mt-0.5 text-slate">{profile.efin_last4 ? `••••${profile.efin_last4}` : "Not set"}</dd>
                  </div>
                )}
                {showFirmPtin && (
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted">PTIN</dt>
                    <dd className="mt-0.5 text-slate">{profile.ptin_last4 ? `••••${profile.ptin_last4}` : "Not set"}</dd>
                  </div>
                )}
                <div className="col-span-2">
                  <dt className="text-xs uppercase tracking-wide text-muted">Supported filing states</dt>
                  <dd className="mt-0.5 text-slate">
                    {profile.supported_filing_states && profile.supported_filing_states.length > 0
                      ? profile.supported_filing_states.join(", ")
                      : "None set"}
                  </dd>
                </div>
              </dl>
            )}
          </SettingsCard>
        </div>
      )}
    </div>
  );
}
