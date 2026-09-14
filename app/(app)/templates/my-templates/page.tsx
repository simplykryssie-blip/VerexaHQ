import { Library, Lock } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace";
import { PageHero, HeroHighlight } from "@/components/ui/PageHero";
import { EmptyState } from "@/components/EmptyState";
import { MyTemplatesList, type InstalledTemplateRow } from "@/components/settings/marketplace/MyTemplatesList";

export const dynamic = "force-dynamic";

export default async function MyTemplatesPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const supabase = createClient();
  const { data: isAdmin } = await supabase.rpc("is_workspace_admin", { p_workspace_id: workspace.id });

  if (!isAdmin) {
    return (
      <>
        <PageHero
          icon={Library}
          tone="violet"
          heading={
            <>
              My <HeroHighlight>Templates</HeroHighlight>.
            </>
          }
          subtitle="Templates you've installed from the Verexa Marketplace."
        />
        <div className="flex-1 px-8 py-6">
          <EmptyState icon={Lock} message="You need admin access to view installed templates." />
        </div>
      </>
    );
  }

  const { data: installed, error } = await supabase.rpc("list_workspace_templates", { p_workspace_id: workspace.id });
  const rows = (installed ?? []) as InstalledTemplateRow[];

  return (
    <>
      <PageHero
        icon={Library}
        tone="violet"
        heading={
          <>
            My <HeroHighlight>Templates</HeroHighlight>.
          </>
        }
        subtitle={
          error
            ? "Couldn't load your installed templates right now."
            : `${rows.length} template${rows.length === 1 ? "" : "s"} installed from the Verexa Marketplace.`
        }
      />
      <div className="flex-1 px-8 py-6">
        {error ? (
          <p className="text-sm text-danger">Couldn&apos;t load your installed templates right now. Refresh the page to try again.</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Library}
            message="You haven't installed any Verexa templates yet."
            action={
              <Link
                href="/templates/marketplace"
                className="rounded-lg border border-accent px-3 py-1.5 text-xs font-medium text-accent hover:bg-accentSoft"
              >
                Browse Marketplace
              </Link>
            }
          />
        ) : (
          <MyTemplatesList workspaceId={workspace.id} templates={rows} />
        )}
      </div>
    </>
  );
}
