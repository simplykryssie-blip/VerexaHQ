import { cache } from "react";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PublicSitePage } from "@/components/site/PublicSitePage";
import type { SitePageData } from "@/components/site/types";

export const dynamic = "force-dynamic";

type Params = { workspaceSlug: string; pageSlug: string };

// Deduped with React's request cache so generateMetadata and the page body
// share one round trip instead of two -- get_public_site_page is a POST RPC,
// which Next's automatic fetch memoization doesn't cover on its own.
const loadPage = cache(async (workspaceSlug: string, pageSlug: string) => {
  const supabase = createClient();
  const { data } = await supabase.rpc("get_public_site_page", { p_workspace_slug: workspaceSlug, p_page_slug: pageSlug });
  return data as unknown as SitePageData | null;
});

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const data = await loadPage(params.workspaceSlug, params.pageSlug);
  if (!data) return { title: "Page not found" };
  return { title: data.page.title, description: data.page.meta_description ?? undefined };
}

export default async function PublicSiteRoutePage({ params }: { params: Params }) {
  const data = await loadPage(params.workspaceSlug, params.pageSlug);

  if (!data) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold text-ink">This page isn&apos;t available</h1>
        <p className="mt-2 text-sm text-muted">It may have been unpublished, or the link is incorrect.</p>
      </div>
    );
  }

  return <PublicSitePage workspaceSlug={params.workspaceSlug} data={data} />;
}
