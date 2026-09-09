// Shared live-URL resolver for the site builder. A page's real public URL
// is either the workspace-hosted relative path, or (once a custom domain is
// attached and verified) the domain itself -- the middleware rewrite maps a
// bare domain root to the page whose slug is "home", so that's the one case
// where the domain path drops the slug entirely.
export function getLiveUrl({
  pageSlug,
  workspaceSlug,
  websiteSlug,
  customDomain,
  domainVerified,
}: {
  pageSlug: string;
  workspaceSlug: string;
  websiteSlug: string;
  customDomain: string | null;
  domainVerified: boolean;
}): string {
  if (customDomain && domainVerified) {
    return `https://${customDomain}/${pageSlug === "home" ? "" : pageSlug}`;
  }
  return `/site/${workspaceSlug}/${websiteSlug}/${pageSlug}`;
}
