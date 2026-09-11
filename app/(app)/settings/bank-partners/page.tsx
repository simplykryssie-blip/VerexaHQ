import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { isEroManagementTier } from "@/lib/workspaceCapabilities";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { BankPartnersManager, type BankPartnerRow } from "@/components/settings/BankPartnersManager";
import { SoftwarePartnersManager, type SoftwarePartnerRow } from "@/components/settings/SoftwarePartnersManager";

export const dynamic = "force-dynamic";

// Banks and software are the ERO/SB's own standing relationships -- each
// with a standard fee schedule -- assigned per PTIN (on the Firms detail
// page) so a return's bank/transmission/paperwork/software fees prefill
// from what's already true of that bank or software, instead of every
// PTIN retyping the same numbers on every single return. Only makes sense
// for a workspace that can have firms connected under it, same gate as
// Packages.
export default async function BankPartnersPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;
  if (!isEroManagementTier(workspace)) redirect("/settings/services");

  const supabase = createClient();
  const [{ data: banks }, { data: softwareList }, { data: canManage }] = await Promise.all([
    supabase
      .from("bank_partners")
      .select("id, name, standard_bank_fee, standard_transmission_fee, standard_paperwork_fee, standard_addon_fee, is_active")
      .eq("workspace_id", workspace.id)
      .order("name"),
    supabase.from("software_partners").select("id, name, standard_fee, is_active").eq("workspace_id", workspace.id).order("name"),
    supabase.rpc("is_workspace_admin", { p_workspace_id: workspace.id }),
  ]);

  return (
    <div className="max-w-3xl space-y-10">
      <div>
        <SettingsSectionHeader
          icon={Wallet}
          title="Banks & Software"
          description="Your bank/transmitter relationships and tax software, each with a standard fee schedule -- assign one of each to a PTIN on their Firm page so their returns prefill the right fees."
        />
        <div className="mt-6">
          <BankPartnersManager workspaceId={workspace.id} banks={(banks ?? []) as BankPartnerRow[]} canManage={Boolean(canManage)} />
        </div>
      </div>

      <div className="border-t border-border pt-10">
        <h2 className="font-display text-sm font-semibold text-ink">Software</h2>
        <div className="mt-4">
          <SoftwarePartnersManager
            workspaceId={workspace.id}
            softwareList={(softwareList ?? []) as SoftwarePartnerRow[]}
            canManage={Boolean(canManage)}
          />
        </div>
      </div>
    </div>
  );
}
