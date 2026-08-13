import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { Building2, FileText } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { BusinessHoursForm } from "@/components/settings/BusinessHoursForm";
import { DEFAULT_BUSINESS_HOURS, DEFAULT_SLOT_MINUTES, type BusinessHours } from "@/lib/businessHours";
import { FirmContactForm } from "./FirmContactForm";
import { BrandCenterForm } from "../brand-center/BrandCenterForm";
import { FirmTaxProfileForm } from "./FirmTaxProfileForm";
import { getEffectiveBranding } from "@/lib/branding";
import { MyProfileForm } from "@/components/settings/MyProfileForm";

export const dynamic = 'force-dynamic';

const EFIN_WORKSPACE_TYPES = new Set(["ero_office", "service_bureau", "multi_office_firm"]);

export default async function FirmProfilePage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: contact }, { data: branding }, { data: settings }, effectiveBranding, { data: myProfile }, { data: isAdmin }] =
    await Promise.all([
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
        .select("display_name, dba, sidebar_logo_url, portal_logo_url, sidebar_text_color, primary_color, secondary_color, accent_color, support_email, support_phone")
        .eq("workspace_id", workspace.id)
        .maybeSingle(),
      supabase.from("system_settings").select("key, value, updated_at").eq("workspace_id", workspace.id).order("key"),
      getEffectiveBranding(workspace.id),
      user
        ? supabase.from("user_profiles").select("first_name, last_name, display_name, avatar_url, phone").eq("id", user.id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.rpc("is_workspace_admin", { p_workspace_id: workspace.id }),
    ]);

  const showEfin = EFIN_WORKSPACE_TYPES.has(workspace.workspace_type);
  const showPtin = workspace.workspace_type === "independent_ptin";

  const businessHours = (settings?.find((s) => s.key === "business_hours")?.value as BusinessHours | undefined) ?? DEFAULT_BUSINESS_HOURS;
  const slotMinutes = (settings?.find((s) => s.key === "booking_slot_minutes")?.value as number | undefined) ?? DEFAULT_SLOT_MINUTES;

  return (
    <div className="max-w-2xl">
      <SettingsSectionHeader
        icon={Building2}
        title="Firm Profile"
        description="Your own profile, plus your firm's identity, branding, and workspace preferences -- tax identifiers, contact info, colors, and booking availability."
      />

      {user && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-ink">Your profile</h3>
          <p className="mt-1 text-xs text-muted">Personal to you -- not shared with the rest of your workspace.</p>
          <div className="mt-3">
            <MyProfileForm
              userId={user.id}
              firstName={myProfile?.first_name ?? null}
              lastName={myProfile?.last_name ?? null}
              displayName={myProfile?.display_name ?? null}
              avatarUrl={myProfile?.avatar_url ?? null}
              phone={myProfile?.phone ?? null}
            />
          </div>
        </div>
      )}

      <div className="mt-8">
        <h3 className="text-sm font-semibold text-ink">Tax identifiers</h3>
        <p className="mt-1 text-xs text-muted">
          EIN, EFIN, and PTIN are encrypted at rest -- only the last 4 digits are ever shown by default, and
          revealing the full value is audit-logged.
        </p>
        <div className="mt-3 rounded-xl border border-border bg-surface p-5">
          {isAdmin ? (
            <FirmTaxProfileForm workspaceId={workspace.id} profile={profile ?? null} showEin showEfin={showEfin} showPtin={showPtin} />
          ) : !profile ? (
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
              {showPtin && (
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
        </div>
      </div>

      {workspace.is_owner && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-ink">Contact information</h3>
          <div className="mt-3 rounded-xl border border-border bg-surface p-5">
            <FirmContactForm
              workspaceId={workspace.id}
              contact={
                contact ?? { phone: null, website: null, mailing_address: null, primary_contact_email: null }
              }
            />
          </div>
        </div>
      )}

      {workspace.is_owner && (
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-ink">Branding</h3>
          {effectiveBranding.isWhitelabeledByEro ? (
            <>
              <p className="mt-1 text-xs text-muted">
                Your branding is managed by {effectiveBranding.eroName ?? "your ERO"} -- your staff dashboard and your clients&apos; portal both
                show their logo and colors.
              </p>
              <div className="mt-3 rounded-xl border border-border bg-surface p-5 text-sm text-slate">
                Connected PTINs don&apos;t have their own Brand Center. If something looks wrong, contact{" "}
                {effectiveBranding.eroName ?? "your ERO"} to have it updated.
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 text-xs text-muted">How your firm appears across your staff dashboard and your clients&apos; portal.</p>
              <div className="mt-3 rounded-xl border border-border bg-surface p-5">
                <BrandCenterForm workspaceId={workspace.id} branding={branding ?? null} />
              </div>
            </>
          )}
        </div>
      )}

      <div className="mt-8">
        <h3 className="text-sm font-semibold text-ink">Booking availability</h3>
        <p className="mt-1 text-xs text-muted">When clients can self-book a bookable service from their portal.</p>
        <div className="mt-3">
          <BusinessHoursForm workspaceId={workspace.id} initialHours={businessHours} initialSlotMinutes={slotMinutes} />
        </div>
      </div>
    </div>
  );
}
