import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { UserCircle } from "lucide-react";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { isEroManagementTier } from "@/lib/workspaceCapabilities";
import { ProfileForm } from "./ProfileForm";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // A solo PTIN-tier workspace IS the business -- there's no separate ERO/SB
  // to hold its own firm identity, so its business contact info and EIN live
  // here on Profile too, rather than on a Firm Profile page it may never see
  // (see app/(app)/settings/firm-profile/page.tsx's own comment for the
  // other half of this split).
  const showBusinessInfo = !isEroManagementTier(workspace);

  const [{ data: myProfile }, { data: isAdmin }, firmTaxResult, contactResult, brandingResult] = await Promise.all([
    supabase.from("user_profiles").select("first_name, last_name, display_name, avatar_url, phone, ptin_last4").eq("id", user.id).maybeSingle(),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "workspace.manage" }),
    showBusinessInfo
      ? supabase.from("firm_tax_profile").select("ein_last4, ptin_last4").eq("workspace_id", workspace.id).maybeSingle()
      : Promise.resolve({ data: null }),
    showBusinessInfo
      ? supabase.from("workspaces").select("phone, website, mailing_address, primary_contact_email").eq("id", workspace.id).single()
      : Promise.resolve({ data: null }),
    showBusinessInfo
      ? supabase.from("branding").select("support_email, support_phone").eq("workspace_id", workspace.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const firmTax = firmTaxResult.data;
  const contact = contactResult.data;
  const branding = brandingResult.data;

  return (
    <div className="max-w-2xl">
      <SettingsSectionHeader icon={UserCircle} title="Profile" description="Your own info and preferences -- personal to you, not shared with the rest of your workspace." />

      <div className="mt-6">
        <ProfileForm
          userId={user.id}
          workspaceId={workspace.id}
          firstName={myProfile?.first_name ?? null}
          lastName={myProfile?.last_name ?? null}
          displayName={myProfile?.display_name ?? null}
          avatarUrl={myProfile?.avatar_url ?? null}
          personalPhone={myProfile?.phone ?? null}
          ptinSource={showBusinessInfo ? "firm" : "personal"}
          ptinLast4={showBusinessInfo ? firmTax?.ptin_last4 ?? null : myProfile?.ptin_last4 ?? null}
          showBusinessInfo={showBusinessInfo}
          isOwner={workspace.is_owner}
          isAdmin={Boolean(isAdmin)}
          einLast4={firmTax?.ein_last4 ?? null}
          website={contact?.website ?? null}
          mailingAddress={contact?.mailing_address ?? null}
          businessPhone={branding?.support_phone ?? contact?.phone ?? null}
          businessEmail={branding?.support_email ?? contact?.primary_contact_email ?? null}
        />
      </div>
    </div>
  );
}
