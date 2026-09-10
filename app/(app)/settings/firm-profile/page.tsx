import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { Building2 } from "lucide-react";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { SettingsCard } from "@/components/settings/SettingsCard";
import { isEroManagementTier } from "@/lib/workspaceCapabilities";
import { getMyEroConnection } from "@/lib/firmConnection";
import { PackageCheckoutCard, type PackagePurchaseRow } from "@/components/settings/PackageCheckoutCard";
import type { OptionGroupRow } from "@/components/settings/PackageOptionGroupsEditor";
import { SoftwareLinksManager } from "@/components/settings/SoftwareLinksManager";
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

    const { data: softwareLinks } = await supabase
      .from("workspace_software_links")
      .select("id, name, url")
      .eq("workspace_id", workspace.id)
      .order("display_order");

    let pkg: { id: string; name: string; description: string | null; flat_price: number | null; billing_cadence: string | null } | null = null;
    let optionGroups: OptionGroupRow[] = [];
    let purchase: PackagePurchaseRow | null = null;

    if (connection.package_id) {
      const [{ data: pkgRow }, { data: groupRows }, { data: purchaseRow }] = await Promise.all([
        supabase.from("firm_packages").select("id, name, description, flat_price, billing_cadence").eq("id", connection.package_id).maybeSingle(),
        supabase
          .from("firm_package_option_groups")
          .select("id, name, min_select, max_select, display_order, firm_package_options(id, label, display_order)")
          .eq("package_id", connection.package_id)
          .order("display_order"),
        supabase
          .from("firm_package_purchases")
          .select("status, billing_cadence, amount, selected_option_ids, current_period_end")
          .eq("connection_id", connection.connection_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      pkg = pkgRow;
      optionGroups = (groupRows ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        min_select: g.min_select,
        max_select: g.max_select,
        display_order: g.display_order,
        options: ((g.firm_package_options ?? []) as { id: string; label: string; display_order: number }[]).sort(
          (a, b) => a.display_order - b.display_order,
        ),
      }));
      purchase = purchaseRow;
    }

    return (
      <div className="max-w-2xl">
        <SettingsSectionHeader
          icon={Building2}
          title="ERO Profile"
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
        {pkg && (
          <div className="mt-6">
            <PackageCheckoutCard connectionId={connection.connection_id} pkg={pkg} groups={optionGroups} purchase={purchase} />
          </div>
        )}
        <div className="mt-6">
          <SoftwareLinksManager workspaceId={workspace.id} initialLinks={softwareLinks ?? []} />
        </div>
      </div>
    );
  }

  const [{ data: profile }, { data: contact }, { data: branding }, { data: isAdmin }, { data: softwareLinks }] = await Promise.all([
    supabase.from("firm_tax_profile").select("ein_last4, efin_last4, ptin_last4, caf_last4, updated_at").eq("workspace_id", workspace.id).maybeSingle(),
    supabase.from("workspaces").select("name, owner_name, phone, website, mailing_address, primary_contact_email").eq("id", workspace.id).single(),
    supabase.from("branding").select("support_email, support_phone").eq("workspace_id", workspace.id).maybeSingle(),
    supabase.rpc("has_permission", { p_workspace_id: workspace.id, p_permission_key: "workspace.manage" }),
    supabase.from("workspace_software_links").select("id, name, url").eq("workspace_id", workspace.id).order("display_order"),
  ]);

  return (
    <div className="max-w-2xl">
      <SettingsSectionHeader icon={Building2} title="ERO Profile" description="Your firm's identity -- shared across every user in this workspace." />

      <div className="mt-6">
        <FirmProfileForm
          workspaceId={workspace.id}
          firmName={contact?.name ?? ""}
          ownerName={contact?.owner_name ?? null}
          website={contact?.website ?? null}
          mailingAddress={contact?.mailing_address ?? null}
          businessPhone={branding?.support_phone ?? contact?.phone ?? null}
          businessEmail={branding?.support_email ?? contact?.primary_contact_email ?? null}
          isOwner={workspace.is_owner}
          isAdmin={Boolean(isAdmin)}
          einLast4={profile?.ein_last4 ?? null}
          efinLast4={profile?.efin_last4 ?? null}
          ptinLast4={profile?.ptin_last4 ?? null}
          cafLast4={profile?.caf_last4 ?? null}
        />
      </div>
      <div className="mt-6">
        <SoftwareLinksManager workspaceId={workspace.id} initialLinks={softwareLinks ?? []} />
      </div>
    </div>
  );
}
