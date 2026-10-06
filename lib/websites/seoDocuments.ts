type PublishedPage = {
  slug: string;
  updated_at: string;
};

export function buildSiteRobots(domain: string): string {
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /portal/",
    "Disallow: /o/",
    "Disallow: /e/",
    "Disallow: /sign/",
    "Disallow: /site-preview/",
    "Disallow: /site/",
    `Sitemap: https://${domain}/sitemap.xml`,
    "",
  ].join("\n");
}

export function buildSiteSitemap(domain: string, pages: PublishedPage[]): string {
  const urls = pages.map(({ slug, updated_at }) => {
    const path = slug === "home" ? "/" : `/${encodeURIComponent(slug)}`;
    return [
      "  <url>",
      `    <loc>https://${domain}${path}</loc>`,
      `    <lastmod>${updated_at.slice(0, 10)}</lastmod>`,
      "  </url>",
    ].join("\n");
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}
