import type { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buildSiteRobots, buildSiteSitemap } from "@/lib/websites/seoDocuments";

export const dynamic = "force-dynamic";

type Params = { kind: string };

// The custom-domain middleware rewrites only /robots.txt and /sitemap.xml
// here. Resolve the original Host against a verified, published website; do
// not derive sitemap contents from an arbitrary hostname or a staff session.
export async function GET(request: NextRequest, { params }: { params: Params }) {
  if (params.kind !== "robots" && params.kind !== "sitemap") {
    return new Response("Not found", { status: 404 });
  }

  const domain = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  if (!domain) return new Response("Not found", { status: 404 });

  const supabase = createServiceClient();
  const { data: website, error } = await supabase
    .from("site_websites")
    .select("id, custom_domain")
    .eq("custom_domain", domain)
    .eq("domain_verified", true)
    .eq("status", "published")
    .maybeSingle();

  if (error) return new Response("Temporarily unavailable", { status: 503 });
  if (!website?.custom_domain) return new Response("Not found", { status: 404 });

  if (params.kind === "robots") {
    return new Response(buildSiteRobots(website.custom_domain), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const { data: pages, error: pagesError } = await supabase
    .from("site_pages")
    .select("slug, updated_at")
    .eq("website_id", website.id)
    .eq("status", "published")
    .order("slug")
    .limit(1000);

  if (pagesError) return new Response("Temporarily unavailable", { status: 503 });

  return new Response(buildSiteSitemap(website.custom_domain, pages ?? []), {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" },
  });
}
