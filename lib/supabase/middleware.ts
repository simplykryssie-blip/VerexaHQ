import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";

const ALWAYS_PUBLIC_PATHS = ["/auth/callback", "/auth/confirm", "/forgot-password", "/reset-password"];
const STAFF_PUBLIC_PATHS = ["/login", "/accept-invitation"];
const PORTAL_PUBLIC_PATHS = ["/portal/login", "/portal/accept-invitation"];

export async function updateSession(request: NextRequest) {
  try {
    // Verify environment variables are set
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error(
        "MIDDLEWARE ERROR: Missing Supabase environment variables",
        {
          hasUrl: !!supabaseUrl,
          hasAnonKey: !!supabaseAnonKey,
        }
      );
      // Return next() to allow request to proceed without auth
      return NextResponse.next({ request });
    }

    let response = NextResponse.next({ request });

    const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const pathname = request.nextUrl.pathname;
    const isPortalPath = pathname.startsWith("/portal");
    const loginPath = isPortalPath ? "/portal/login" : "/login";
    const homePath = isPortalPath ? "/portal/dashboard" : "/dashboard";
    const audiencePublicPaths = isPortalPath ? PORTAL_PUBLIC_PATHS : STAFF_PUBLIC_PATHS;
    const isPublicPath =
      ALWAYS_PUBLIC_PATHS.some((path) => pathname.startsWith(path)) || audiencePublicPaths.some((path) => pathname.startsWith(path));

    if (!user && !isPublicPath) {
      const redirectUrl = new URL(loginPath, request.url);
      redirectUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(redirectUrl);
    }

    // "Remember me" enforcement: a "temporary" marker is a true browser-session
    // cookie (no maxAge), unlike the underlying Supabase auth cookies which this
    // client version always persists long-term regardless of options. If the
    // marker is gone while the auth cookies remain, the browser was closed and
    // reopened on a session the user asked not to be remembered -- sign out.
    if (user && !isPublicPath && !request.cookies.get("sb_remember")) {
      await supabase.auth.signOut();
      const redirectUrl = new URL(loginPath, request.url);
      const signedOutResponse = NextResponse.redirect(redirectUrl);
      response.cookies.getAll().forEach((cookie) => signedOutResponse.cookies.set(cookie));
      return signedOutResponse;
    }

    if (user && pathname === loginPath) {
      return NextResponse.redirect(new URL(homePath, request.url));
    }

    return response;
  } catch (error) {
    console.error(
      "MIDDLEWARE ERROR",
      error instanceof Error ? { message: error.message, stack: error.stack } : error
    );
    // Never throw from middleware - return next() to allow request to proceed
    return NextResponse.next({ request });
  }
}
