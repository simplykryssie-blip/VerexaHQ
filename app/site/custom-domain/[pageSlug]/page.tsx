import { headers } from "next/headers";
import { notFound } from "next/navigation";
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
  const domain = currentDomain();
  const data = await loadPage(domain, params.pageSlug);
  if (!data) return { title: "Page not found", robots: { index: false, follow: false } };

  const canonical = `https://${domain}/${params.pageSlug === "home" ? "" : encodeURIComponent(params.pageSlug)}`;
  const title = data.page.title === "Home" ? data.website.name : `${data.page.title} | ${data.website.name}`;
  const description = data.page.meta_description ?? undefined;
  // This website's own favicon takes priority over the owning workspace's
  // branding logo -- a workspace can publish more than one differently-
  // branded website (e.g. a product microsite alongside the firm's main
  // site), and the link-preview thumbnail most chat apps show from
  // openGraph/twitter images should reflect THIS site's brand, not
  // whichever logo happens to be set on the workspace.
  const workspaceLogo = data.branding?.logo_url?.startsWith("https://") ? data.branding.logo_url : undefined;
  const shareImage = data.website.favicon_url?.startsWith("https://") ? data.website.favicon_url : workspaceLogo;

  return {
    title,
    description,
    icons: data.website.favicon_url ? { icon: data.website.favicon_url } : undefined,
    alternates: { canonical },
    openGraph: {
      type: "website",
      title,
      description,
      url: canonical,
      siteName: data.website.name,
      images: shareImage ? [{ url: shareImage }] : undefined,
    },
    twitter: { card: "summary", title, description, images: shareImage ? [shareImage] : undefined },
  };
}

export default async function CustomDomainSitePage({ params }: { params: Params }) {
  const data = await loadPage(currentDomain(), params.pageSlug);
  if (!data) notFound();

  return <PublicSitePage workspaceSlug={data.workspace_slug} websiteSlug={data.website_slug} data={data} />;
}
