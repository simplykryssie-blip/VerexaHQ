import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";

const ALWAYS_PUBLIC_PATHS = ["/auth/callback", "/auth/confirm", "/forgot-password", "/reset-password", "/sign/", "/o/", "/e/"];
const STAFF_PUBLIC_PATHS = ["/login", "/accept-invitation", "/mfa-challenge"];
const PORTAL_PUBLIC_PATHS = ["/portal/login", "/portal/accept-invitation"];
const PORTAL_BASIC_INFO_EXEMPT_PATHS = ["/portal/login", "/portal/accept-invitation", "/portal/basic-info"];
const MFA_EXEMPT_STAFF_PATHS = ["/mfa-challenge", "/settings/security", "/login"];

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
    const isApiPath = pathname.startsWith("/api/");
    const isPortalPath = pathname.startsWith("/portal");
    const loginPath = isPortalPath ? "/portal/login" : "/login";
    const homePath = isPortalPath ? "/portal/dashboard" : "/dashboard";
    const audiencePublicPaths = isPortalPath ? PORTAL_PUBLIC_PATHS : STAFF_PUBLIC_PATHS;
    const isPublicPath =
      isApiPath ||
      ALWAYS_PUBLIC_PATHS.some((path) => pathname.startsWith(path)) ||
      audiencePublicPaths.some((path) => pathname.startsWith(path));

    // API routes are never redirected -- each one already runs its own
    // supabase.auth.getUser() check and returns 401/JSON as appropriate.
    // A page-style redirect here would silently break fetch() callers
    // (e.g. this exact route, /api/auth/set-remember: it's the request
    // that CREATES the "remember me" cookie below, so if it were subject
    // to that same check it would always find the cookie missing and
    // sign the brand-new session straight back out).
    if (!isApiPath) {
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
    }

    // Portal basic-info gate: a client can't reach anything else in the
    // portal until they've submitted name/email/phone/mailing address once
    // -- that submission is what populates the client tab and what
    // organizers prefill from. Mirrors the staff MFA gate below.
    if (user && !isApiPath && isPortalPath && !PORTAL_BASIC_INFO_EXEMPT_PATHS.some((path) => pathname.startsWith(path))) {
      const { data: completed } = await supabase.rpc("has_completed_portal_basic_info");
      if (!completed) {
        const redirectUrl = new URL("/portal/basic-info", request.url);
        redirectUrl.searchParams.set("next", pathname);
        return NextResponse.redirect(redirectUrl);
      }
    }

    // MFA: staff only (client portal users are out of scope for now). A
    // verified factor that hasn't cleared this session's challenge sends the
    // user to /mfa-challenge; a workspace that requires MFA but where this
    // user has enrolled nothing sends them to enroll instead.
    if (user && !isApiPath && !isPortalPath && !MFA_EXEMPT_STAFF_PATHS.some((path) => pathname.startsWith(path))) {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

      if (aal && aal.currentLevel === "aal1" && aal.nextLevel === "aal2") {
        const redirectUrl = new URL("/mfa-challenge", request.url);
        redirectUrl.searchParams.set("next", pathname);
        return NextResponse.redirect(redirectUrl);
      }

      if (aal && aal.currentLevel === "aal1" && aal.nextLevel === "aal1") {
        const { data: membership } = await supabase
          .from("workspace_users")
          .select("workspace_id")
          .eq("user_id", user.id)
          .eq("status", "active")
          .limit(1)
          .maybeSingle();

        if (membership) {
          const { data: policy } = await supabase
            .from("workspace_security_policies")
            .select("mfa_required")
            .eq("workspace_id", membership.workspace_id)
            .maybeSingle();

          if (policy?.mfa_required) {
            return NextResponse.redirect(new URL("/settings/security", request.url));
          }
        }
      }
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
