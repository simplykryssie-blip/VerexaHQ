import { Store, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHero, HeroHighlight } from "@/components/ui/PageHero";
import { EmptyState } from "@/components/EmptyState";
import { MarketplaceGrid, type MarketplaceTemplateRow } from "@/components/settings/marketplace/MarketplaceGrid";

export const dynamic = "force-dynamic";

export default async function MarketplacePage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: isAdmin } = await supabase.rpc("is_workspace_admin", { p_workspace_id: workspace.id });

  if (!isAdmin) {
    return (
      <>
        <PageHero
          icon={Store}
          tone="violet"
          heading={
            <>
              Template <HeroHighlight>Marketplace</HeroHighlight>.
            </>
          }
          subtitle="Install Verexa-built templates into your workspace."
        />
        <div className="flex-1 px-8 py-6">
          <EmptyState icon={Lock} message="You need admin access to browse the Marketplace." />
        </div>
      </>
    );
  }

  const { data: templates, error } = await supabase.rpc("list_marketplace_templates", { p_workspace_id: workspace.id });
  const rows = (templates ?? []) as MarketplaceTemplateRow[];

  return (
    <>
      <PageHero
        icon={Store}
        tone="violet"
        heading={
          <>
            Template <HeroHighlight>Marketplace</HeroHighlight>.
          </>
        }
        subtitle={
          error
            ? "Couldn't load the Marketplace right now."
            : `${rows.length} Verexa template${rows.length === 1 ? "" : "s"} available for your workspace.`
        }
      />
      <div className="flex-1 px-8 py-6">
        {error ? (
          <p className="text-sm text-danger">Couldn&apos;t load the Marketplace right now. Refresh the page to try again.</p>
        ) : (
          <MarketplaceGrid workspaceId={workspace.id} templates={rows} />
        )}
      </div>
    </>
  );
}
