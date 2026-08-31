import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PublicSitePage } from "@/components/site/PublicSitePage";
import type { SitePageData } from "@/components/site/types";

export const dynamic = "force-dynamic";

// The real Verexa HQ marketing site lives in site_pages like any workspace's
// published website -- this is just the one hardcoded to render at the bare
// domain instead of a logged-out visitor landing on the staff login screen.
// A signed-in visit to "/" still goes straight to the dashboard, same as
// before this existed.
const HOME_WORKSPACE_SLUG = "verexa-hq-crm";
const HOME_WEBSITE_SLUG = "www";
const HOME_PAGE_SLUG = "home";

async function loadHomePage() {
  const supabase = createClient();
  const { data } = await supabase.rpc("get_public_site_page", {
    p_workspace_slug: HOME_WORKSPACE_SLUG,
    p_website_slug: HOME_WEBSITE_SLUG,
    p_page_slug: HOME_PAGE_SLUG,
  });
  return data as unknown as SitePageData | null;
}

export async function generateMetadata(): Promise<Metadata> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) return {};

  const data = await loadHomePage();
  if (!data) return {};
  return {
    title: data.page.title,
    description: data.page.meta_description ?? undefined,
    icons: data.website.favicon_url ? { icon: data.website.favicon_url } : undefined,
  };
}

export default async function RootPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  const data = await loadHomePage();
  if (!data) redirect("/dashboard");

  return <PublicSitePage workspaceSlug={HOME_WORKSPACE_SLUG} websiteSlug={HOME_WEBSITE_SLUG} data={data} showLoginLink />;
}
