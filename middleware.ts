import { NextResponse, type NextRequest } from "next/server";

// Paths that must never be routed through the /setup<->/login redirect
// logic below, regardless of Supabase configuration state: the public
// tax-intake flow (taxpayer-facing, no session, no login) and its
// supporting API routes. Matched by exact folder boundary ("/intake/",
// not "/intake") so this can never also match "/intake-review" (staff
// review queue) -- that route stays inside the authenticated (app) route
// group and is gated by its own client-side session check in
// app/(app)/layout.tsx, not by this middleware.
const PUBLIC_INTAKE_PREFIXES = ["/intake/", "/api/intake/"];

function isPublicIntakePath(pathname: string): boolean {
  if (pathname === "/intake") return true;
  return PUBLIC_INTAKE_PREFIXES.some((p) => pathname.startsWith(p));
}

// Temporary diagnostic header (non-sensitive: the short commit SHA Vercel
// injects at build time) so it's possible to independently confirm which
// deployment actually served a given response -- e.g. via curl -I or
// browser devtools -- rather than trusting the Vercel dashboard's
// "Ready" status alone. Safe to remove once the deployment-routing
// investigation for PR #7 is closed out.
const BUILD_SHA = (process.env.VERCEL_GIT_COMMIT_SHA || "unknown").slice(0, 7);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublicIntakePath(pathname)) {
    const res = NextResponse.next();
    res.headers.set("X-Verexa-Build", BUILD_SHA);
    return res;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();
  const configured = Boolean(url && key && url.startsWith("https://") && !key.includes("replace-with"));
  if (!configured && pathname !== "/setup") {
    const next = request.nextUrl.clone();
    next.pathname = "/setup";
    next.search = "";
    return NextResponse.redirect(next);
  }
  if (configured && pathname === "/setup") {
    const next = request.nextUrl.clone();
    next.pathname = "/login";
    return NextResponse.redirect(next);
  }
  return NextResponse.next();
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"] };
