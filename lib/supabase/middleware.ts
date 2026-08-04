import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";

const PUBLIC_PATHS = ["/login", "/auth/callback", "/auth/confirm", "/forgot-password", "/accept-invitation"];

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

    const isPublicPath = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));

    if (!user && !isPublicPath) {
      const redirectUrl = new URL("/login", request.url);
      redirectUrl.searchParams.set("next", request.nextUrl.pathname);
      return NextResponse.redirect(redirectUrl);
    }

    // "Remember me" enforcement: a "temporary" marker is a true browser-session
    // cookie (no maxAge), unlike the underlying Supabase auth cookies which this
    // client version always persists long-term regardless of options. If the
    // marker is gone while the auth cookies remain, the browser was closed and
    // reopened on a session the user asked not to be remembered -- sign out.
    if (user && !isPublicPath && !request.cookies.get("sb_remember")) {
      await supabase.auth.signOut();
      const redirectUrl = new URL("/login", request.url);
      const signedOutResponse = NextResponse.redirect(redirectUrl);
      response.cookies.getAll().forEach((cookie) => signedOutResponse.cookies.set(cookie));
      return signedOutResponse;
    }

    if (user && request.nextUrl.pathname === "/login") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
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
