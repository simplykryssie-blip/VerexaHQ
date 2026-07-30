import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase session cookie on every request. This is the only
// place session refresh happens — Server Components can't write cookies,
// so without this, sessions would silently expire mid-navigation.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthRoute =
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/auth");
  const isPortalRoute = pathname.startsWith("/portal");
  const isPortalAuthRoute =
    pathname.startsWith("/portal/sign-in") ||
    pathname.startsWith("/portal/forgot-password") ||
    pathname.startsWith("/portal/reset-password");
  // Magic-link signing never requires a portal login — the single-use token
  // itself is the credential, matching the redeem_signature_token RPC.
  const isPortalPublicRoute = pathname.startsWith("/portal/sign/");
  const isPublicRoute = pathname === "/" || pathname.startsWith("/api") || isPortalPublicRoute;

  if (!user && !isAuthRoute && !isPortalAuthRoute && !isPublicRoute) {
    const redirectTo = isPortalRoute ? "/portal/sign-in" : "/sign-in";
    const url = request.nextUrl.clone();
    url.pathname = redirectTo;
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}
