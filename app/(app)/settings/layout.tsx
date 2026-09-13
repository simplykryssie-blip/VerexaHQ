import { SettingsNav } from "./SettingsNav";
import { PageHeader } from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { isEroManagementTier, isServiceBureauTier } from "@/lib/workspaceCapabilities";
import { getMyEroConnection } from "@/lib/firmConnection";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const workspace = await getCurrentWorkspace();
  // A PTIN-tier workspace only gets a Firm Profile page once it's actually
  // connected to an ERO/service bureau -- an ERO-tier workspace is always
  // the parent side of a connection (never the child), so it's never worth
  // the RPC round-trip for it.
  const showFirmProfile =
    !workspace || isEroManagementTier(workspace) || Boolean(await getMyEroConnection(createClient(), workspace.id));
  // Packages (a sellable software/banking bundle) only makes sense for a
  // Service Bureau -- an ERO manages connected PTINs too but never resells
  // a package. The page itself already redirects anyone else to Services,
  // so the nav link shouldn't be there to click in the first place.
  const hidePackages = !workspace || !isServiceBureauTier(workspace);
  // Banks & Software (a standard fee schedule assigned per connected PTIN)
  // is broader than Packages -- any workspace that can have firms connected
  // under it needs this, not just a Service Bureau. The page itself already
  // gates on isEroManagementTier (settings/bank-partners/page.tsx); the nav
  // link needs the same gate, not Packages' narrower one.
  const hideBankPartners = !workspace || !isEroManagementTier(workspace);

  return (
    <>
      <PageHeader title="Settings" description="Configure your workspace." />
      <div className="flex flex-1 flex-col lg:flex-row">
        <SettingsNav hideFirmProfile={!showFirmProfile} hidePackages={hidePackages} hideBankPartners={hideBankPartners} />
        <div className="min-w-0 flex-1 px-4 py-6 sm:px-8">{children}</div>
      </div>
    </>
  );
}
