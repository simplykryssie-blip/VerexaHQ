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
  const isPublicRoute = pathname === "/" || pathname.startsWith("/api");

  if (!user && !isAuthRoute && !isPublicRoute) {
    const redirectTo = isPortalRoute ? "/portal/sign-in" : "/sign-in";
    const url = request.nextUrl.clone();
    url.pathname = redirectTo;
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}
