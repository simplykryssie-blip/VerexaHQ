import { cache } from "react";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PublicSitePage } from "@/components/site/PublicSitePage";
import type { SitePageData } from "@/components/site/types";

export const dynamic = "force-dynamic";

// Matches app/page.tsx's HOME_WORKSPACE_SLUG -- that route only special-cases
// the bare "/" apex for Verexa's own homepage, so every other page of
// Verexa's own site (About, Pricing, ...) came through here instead and
// never got showLoginLink, even though it's Verexa's own visitors -- not a
// tenant firm's -- who should see a way to log into their account from any
// page, not just the home page.
const VEREXA_OWN_WORKSPACE_SLUG = "verexa-hq-crm";

type Params = { workspaceSlug: string; websiteSlug: string; pageSlug: string };

// Deduped with React's request cache so generateMetadata and the page body
// share one round trip instead of two -- get_public_site_page is a POST RPC,
// which Next's automatic fetch memoization doesn't cover on its own.
const loadPage = cache(async (workspaceSlug: string, websiteSlug: string, pageSlug: string) => {
  const supabase = createClient();
  const { data } = await supabase.rpc("get_public_site_page", {
    p_workspace_slug: workspaceSlug,
    p_website_slug: websiteSlug,
    p_page_slug: pageSlug,
  });
  return data as unknown as SitePageData | null;
});

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const data = await loadPage(params.workspaceSlug, params.websiteSlug, params.pageSlug);
  if (!data) return { title: "Page not found" };
  return {
    title: data.page.title,
    description: data.page.meta_description ?? undefined,
    icons: data.website.favicon_url ? { icon: data.website.favicon_url } : undefined,
  };
}

export default async function PublicSiteRoutePage({ params }: { params: Params }) {
  const data = await loadPage(params.workspaceSlug, params.websiteSlug, params.pageSlug);

  if (!data) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold text-ink">This page isn&apos;t available</h1>
        <p className="mt-2 text-sm text-muted">It may have been unpublished, or the link is incorrect.</p>
      </div>
    );
  }

  return (
    <PublicSitePage
      workspaceSlug={params.workspaceSlug}
      websiteSlug={params.websiteSlug}
      data={data}
      showLoginLink={params.workspaceSlug === VEREXA_OWN_WORKSPACE_SLUG}
    />
  );
}
