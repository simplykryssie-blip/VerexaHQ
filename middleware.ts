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

export async function middleware(request: NextRequest) {
  // The raw Host header, not request.nextUrl.hostname -- in local dev,
  // Next constructs nextUrl from the server's bound listen address rather
  // than the incoming Host, so it never reflects a custom domain there.
  // The header itself is reliable in both dev and production.
  const hostname = (request.headers.get("host") ?? request.nextUrl.hostname).split(":")[0];

  if (!isAppHostname(hostname)) {
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
