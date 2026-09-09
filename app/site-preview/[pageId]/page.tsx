import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PublicSitePage } from "@/components/site/PublicSitePage";
import type { SitePageData } from "@/components/site/types";

export const dynamic = "force-dynamic";

type PreviewData = SitePageData & { workspace_slug: string; website_slug: string };

// Deliberately outside the (app) route group -- the whole point is to
// render a draft page with none of the CRM shell (sidebar, header) around
// it, at real viewport width, so "what will this look like once published"
// is answered by literally the same PublicSitePage component real visitors
// get rather than a narrower in-app mockup. Access control lives in the
// get_site_page_preview RPC itself (is_workspace_member on the page's
// workspace), not page status -- a draft page previews the same as a
// published one.
export default async function SitePagePreviewRoute({ params }: { params: { pageId: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase.rpc("get_site_page_preview", { p_page_id: params.pageId });
  if (!data) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold text-ink">This page isn&apos;t available</h1>
        <p className="mt-2 text-sm text-muted">It may have been deleted, or you don&apos;t have access to it.</p>
      </div>
    );
  }

  const payload = data as unknown as PreviewData;
  return <PublicSitePage workspaceSlug={payload.workspace_slug} websiteSlug={payload.website_slug} data={payload} previewMode />;
}
