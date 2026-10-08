import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Hostnames that serve the VerexaHQ app itself. Any other hostname on this
// matcher is presumed to be a workspace's own custom domain pointed at a
// published website, and gets rewritten straight to the domain-scoped
// public site resolver before any of the staff/portal auth logic in
// updateSession runs -- a visitor to a client's marketing domain must never
// be bounced to the staff login page.
function isAppHostname(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  if (hostname.endsWith(".vercel.app")) return true;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    try {
      if (hostname === new URL(appUrl).hostname) return true;
    } catch {
      // malformed env value -- fall through and treat the host as external
    }
  }
  return false;
}

// Client-facing document/booking links a workspace can hand out or embed
// anywhere -- an email, a text, a link on their own branded domain. These
// must always resolve to the real page they point to, even on a hostname
// this middleware doesn't recognize as the app itself; otherwise a firm
// that sets up a custom domain and shares one of these links (or embeds it
// in an iframe on their own site) would have it silently swapped for the
// custom-domain marketing-site resolver instead of the actual form/letter/
// booking page. Mirrors the client-facing subset of ALWAYS_PUBLIC_PATHS in
// lib/supabase/middleware.ts (auth/reset-password/etc. aren't included --
// those are staff-facing app URLs, not links meant to be shared externally).
// /api/wisp/ covers any custom_html funnel section's calls into the WISP
// Builder's verification/capture API (app/api/wisp/verify) -- without this,
// a POST from a published site on its own custom domain (the normal case;
// see the WISP Generator page) gets caught by the rewrite below, which only
// ever looks at the first path segment as a page slug ("api", here) and
// 404s. Platform-wide fix: this isn't specific to any one funnel/workspace,
// it's what makes this whole class of client-facing API call work on any
// custom domain, the same way /api/o/ and /api/e/ already do.
const CROSS_DOMAIN_SAFE_PATH_PREFIXES = ["/o/", "/e/", "/sign/", "/book/", "/api/o/", "/api/e/", "/api/wisp/"];

export async function middleware(request: NextRequest) {
  // The raw Host header, not request.nextUrl.hostname -- in local dev,
  // Next constructs nextUrl from the server's bound listen address rather
  // than the incoming Host, so it never reflects a custom domain there.
  // The header itself is reliable in both dev and production.
  const hostname = (request.headers.get("host") ?? request.nextUrl.hostname).split(":")[0];
  const pathname = request.nextUrl.pathname;
  const isCrossDomainSafePath = CROSS_DOMAIN_SAFE_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (!isAppHostname(hostname) && !isCrossDomainSafePath) {
    // Search-engine documents need their own content types, not the generic
    // page resolver's HTML response for a page named "robots.txt" or
    // "sitemap.xml". Preserve Host so the handler can resolve this website.
    if (pathname === "/robots.txt" || pathname === "/sitemap.xml") {
      const url = request.nextUrl.clone();
      url.pathname = pathname === "/robots.txt" ? "/api/site-seo/robots" : "/api/site-seo/sitemap";
      return NextResponse.rewrite(url);
    }

    // Site page slugs are a single flat segment (site_pages.slug has no
    // nesting), so only the first path segment is ever meaningful; the bare
    // domain root maps to the "home" page by convention.
    const pageSlug = request.nextUrl.pathname.split("/").filter(Boolean)[0] ?? "home";
    const url = request.nextUrl.clone();
    url.pathname = `/site/custom-domain/${pageSlug}`;
    return NextResponse.rewrite(url);
  }

  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
