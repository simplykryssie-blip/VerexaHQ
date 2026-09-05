import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { Building2 } from "lucide-react";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { SettingsCard } from "@/components/settings/SettingsCard";
import { isEroManagementTier } from "@/lib/workspaceCapabilities";
import { getMyEroConnection } from "@/lib/firmConnection";
import { FirmProfileForm } from "./FirmProfileForm";

export const dynamic = "force-dynamic";

export default async function FirmProfilePage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const eroTier = isEroManagementTier(workspace);

  // A PTIN-tier workspace has no firm identity of its own to show here --
  // its own business info and EIN live on Profile instead (see that page's
  // own comment). This page only exists for it once it's connected to an
  // ERO/service bureau, and then shows *that* firm's info, read-only --
  // it isn't the PTIN holder's own data to edit.
  if (!eroTier) {
    const connection = await getMyEroConnection(supabase, workspace.id);
    if (!connection) redirect("/settings/profile");

    return (
      <div className="max-w-2xl">
        <SettingsSectionHeader
          icon={Building2}
          title="Firm Profile"
          description={`You're connected to ${connection.name} -- their firm info is shown here for reference. Your own info lives on your Profile page instead.`}
        />
        <div className="mt-6">
          <SettingsCard title={connection.name} description="Managed by the firm you're connected to -- not editable from here.">
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Phone</dt>
                <dd className="mt-0.5 text-slate">{connection.phone || "Not set"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Email</dt>
                <dd className="mt-0.5 text-slate">{connection.primary_contact_email || "Not set"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-muted">Website</dt>
                <dd className="mt-0.5 text-slate">{connection.website || "Not set"}</dd>
              </div>
            </dl>
          </SettingsCard>
        </div>
      </div>
    );
  }

  const [{ data: profile }, { data: contact }, { data: branding }, { data: isAdmin }] = await Promise.all([
    supabase.from("firm_tax_profile").select("ein_last4, efin_last4, updated_at").eq("workspace_id", workspace.id).maybeSingle(),
    supabase.from("workspaces").select("phone, website, mailing_address, primary_contact_email").eq("id", workspace.id).single(),
    supabase.from("branding").select("support_email, support_phone").eq("workspace_id", workspace.id).maybeSingle(),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "workspace.manage" }),
  ]);

  return (
    <div className="max-w-2xl">
      <SettingsSectionHeader icon={Building2} title="Firm Profile" description="Your firm's identity -- shared across every user in this workspace." />

      <div className="mt-6">
        <FirmProfileForm
          workspaceId={workspace.id}
          website={contact?.website ?? null}
          mailingAddress={contact?.mailing_address ?? null}
          businessPhone={branding?.support_phone ?? contact?.phone ?? null}
          businessEmail={branding?.support_email ?? contact?.primary_contact_email ?? null}
          isOwner={workspace.is_owner}
          isAdmin={Boolean(isAdmin)}
          einLast4={profile?.ein_last4 ?? null}
          efinLast4={profile?.efin_last4 ?? null}
        />
      </div>
    </div>
  );
}
