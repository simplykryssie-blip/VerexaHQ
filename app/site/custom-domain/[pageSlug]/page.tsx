import { headers } from "next/headers";
import { cache } from "react";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PublicSitePage } from "@/components/site/PublicSitePage";
import type { SitePageData } from "@/components/site/types";

export const dynamic = "force-dynamic";

type Params = { pageSlug: string };
type DomainPageData = SitePageData & { workspace_slug: string; website_slug: string };

// Reached only via middleware's host-based rewrite for a custom domain --
// the incoming Host header survives the rewrite unchanged, so it's read
// straight off the request rather than passed through the URL.
const loadPage = cache(async (domain: string, pageSlug: string) => {
  const supabase = createClient();
  const { data } = await supabase.rpc("get_public_site_page_by_domain", {
    p_domain: domain,
    p_page_slug: pageSlug,
  });
  return data as unknown as DomainPageData | null;
});

function currentDomain() {
  return headers().get("host") ?? "";
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const data = await loadPage(currentDomain(), params.pageSlug);
  if (!data) return { title: "Page not found" };
  return {
    title: data.page.title,
    description: data.page.meta_description ?? undefined,
    icons: data.website.favicon_url ? { icon: data.website.favicon_url } : undefined,
  };
}

export default async function CustomDomainSitePage({ params }: { params: Params }) {
  const data = await loadPage(currentDomain(), params.pageSlug);

  if (!data) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold text-ink">This page isn&apos;t available</h1>
        <p className="mt-2 text-sm text-muted">It may have been unpublished, or the link is incorrect.</p>
      </div>
    );
  }

  return <PublicSitePage workspaceSlug={data.workspace_slug} websiteSlug={data.website_slug} data={data} />;
}
