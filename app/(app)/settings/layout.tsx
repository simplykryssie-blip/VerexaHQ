import { SettingsNav } from "./SettingsNav";
import { PageHeader } from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { isEroManagementTier } from "@/lib/workspaceCapabilities";
import { getMyEroConnection } from "@/lib/firmConnection";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const workspace = await getCurrentWorkspace();
  // A PTIN-tier workspace only gets a Firm Profile page once it's actually
  // connected to an ERO/service bureau -- an ERO-tier workspace is always
  // the parent side of a connection (never the child), so it's never worth
  // the RPC round-trip for it.
  const showFirmProfile =
    !workspace || isEroManagementTier(workspace) || Boolean(await getMyEroConnection(createClient(), workspace.id));

  return (
    <>
      <PageHeader title="Settings" description="Configure your workspace." />
      <div className="flex flex-1 flex-col lg:flex-row">
        <SettingsNav hideFirmProfile={!showFirmProfile} />
        <div className="min-w-0 flex-1 px-4 py-6 sm:px-8">{children}</div>
      </div>
    </>
  );
}
