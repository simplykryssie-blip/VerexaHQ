import { describe, expect, it } from "vitest";
import { buildSiteRobots, buildSiteSitemap } from "@/lib/websites/seoDocuments";

describe("custom-domain search documents", () => {
  it("maps the home slug to the root and includes only supplied published pages", () => {
    const xml = buildSiteSitemap("mkbfinancialgroup.com", [
      { slug: "home", updated_at: "2026-10-02T12:00:00Z" },
      { slug: "bookkeeping", updated_at: "2026-10-03T12:00:00Z" },
    ]);

    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain("<loc>https://mkbfinancialgroup.com/</loc>");
    expect(xml).toContain("<loc>https://mkbfinancialgroup.com/bookkeeping</loc>");
    expect(xml).toContain("<lastmod>2026-10-03</lastmod>");
    expect(xml).not.toContain("/home</loc>");
    expect(xml).not.toContain("/site/");
  });

  it("allows public site pages but excludes client-facing and staff routes", () => {
    const robots = buildSiteRobots("mkbfinancialgroup.com");

    expect(robots).toContain("Allow: /\n");
    expect(robots).toContain("Disallow: /portal/\n");
    expect(robots).toContain("Disallow: /o/\n");
    expect(robots).toContain("Disallow: /sign/\n");
    expect(robots).toContain("Sitemap: https://mkbfinancialgroup.com/sitemap.xml\n");
  });
});
