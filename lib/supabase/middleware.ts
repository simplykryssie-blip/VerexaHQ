import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";
import { assertSupabaseProjectMatchesEnvironment, getAppEnvironment } from "@/lib/env";

const ALWAYS_PUBLIC_PATHS = ["/auth/callback", "/auth/confirm", "/forgot-password", "/reset-password", "/sign/", "/o/", "/e/", "/site/", "/book/", "/privacy", "/terms", "/contact", "/docs/"];
const STAFF_PUBLIC_PATHS = ["/login", "/accept-invitation", "/join", "/mfa-challenge", "/signup"];
const PORTAL_PUBLIC_PATHS = ["/portal/login", "/portal/accept-invitation"];
const PORTAL_BASIC_INFO_EXEMPT_PATHS = ["/portal/login", "/portal/accept-invitation", "/portal/basic-info"];
// VEREXA-AAL-001: these were previously one combined list that also
// exempted /settings/security from the AAL2-step-up redirect below -- which
// meant a session with a verified factor but no completed challenge this
// session (the exact stolen-password scenario this finding is about) could
// reach the one page that can remove that factor without ever being
// challenged. Split in two: the step-up redirect (MFA_CHALLENGE_EXEMPT_PATHS)
// no longer exempts /settings/security, so that path now forces the
// challenge first. The enrollment-forcing redirect (MFA_ENROLLMENT_EXEMPT_PATHS)
// still must exempt /settings/security -- it's that redirect's own
// destination, and removing the exemption there would redirect a
// no-factor-enrolled user visiting /settings/security back to itself.
const MFA_CHALLENGE_EXEMPT_PATHS = ["/mfa-challenge", "/login"];
const MFA_ENROLLMENT_EXEMPT_PATHS = ["/mfa-challenge", "/settings/security", "/login"];

// How long a brand-new session gets before the missing-"remember me"-marker
// check (below) starts enforcing -- covers the moment right after login,
// where the client is still in the middle of confirming the sb_remember
// cookie landed (see app/login/page.tsx), so a single slow request in that
// window doesn't sign a user out of the session they just created.
const REMEMBER_MARKER_GRACE_PERIOD_SECONDS = 120;

function getSessionIssuedAt(accessToken: string): number | null {
  try {
    const payload = accessToken.split(".")[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(base64));
    return typeof json.iat === "number" ? json.iat : null;
  } catch {
    return null;
  }
}

export async function updateSession(request: NextRequest) {
  // VEREXA-ENV-001: deliberately OUTSIDE the try/catch below. That catch
  // exists so middleware never throws on an unrelated failure (see its own
  // comment) -- an environment/Supabase-project mismatch is the one
  // failure that must escape uncaught instead of being swallowed into a
  // normal request continuing against the wrong Supabase project.
  assertSupabaseProjectMatchesEnvironment(process.env.NEXT_PUBLIC_SUPABASE_URL, getAppEnvironment());

  try {
    // Verify environment variables are set
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // Threads the current pathname to app/(app)/layout.tsx via a request
    // header -- a Server Component layout has no other way to know the
    // route it's rendering for, and the Phase 3 suspension gate needs it to
    // let the billing-recovery page (and only that page) through. Built
    // once and passed to every NextResponse.next({ request }) call below
    // (including the one inside setAll, which otherwise reconstructs a
    // fresh response and would silently drop a header set directly on a
    // response instead of the request).
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-pathname", request.nextUrl.pathname);
    const nextRequestInit = { request: { headers: requestHeaders } };

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error(
        "MIDDLEWARE ERROR: Missing Supabase environment variables",
        {
          hasUrl: !!supabaseUrl,
          hasAnonKey: !!supabaseAnonKey,
        }
      );
      // Return next() to allow request to proceed without auth
      return NextResponse.next(nextRequestInit);
    }

    let response = NextResponse.next(nextRequestInit);

    const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next(nextRequestInit);
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
      // Exact match only -- every path starts with "/", so this can't join
      // ALWAYS_PUBLIC_PATHS's startsWith list without making everything public.
      // The bare root now renders its own marketing page for signed-out
      // visitors (app/page.tsx) and redirects signed-in ones to /dashboard
      // itself, so it must reach that component instead of being bounced to
      // /login here first.
      pathname === "/" ||
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
        // Preserve query params too (pathname alone drops them) -- a
        // protected link like /settings/connections?token=... needs the
        // token to survive the round trip through login and back.
        redirectUrl.searchParams.set("next", pathname + request.nextUrl.search);
        return NextResponse.redirect(redirectUrl);
      }

      // "Remember me" enforcement: a "temporary" marker is a true browser-session
      // cookie (no maxAge), unlike the underlying Supabase auth cookies which this
      // client version always persists long-term regardless of options. If the
      // marker is gone while the auth cookies remain, the browser was closed and
      // reopened on a session the user asked not to be remembered -- sign out.
      if (user && !isPublicPath && !request.cookies.get("sb_remember")) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const issuedAt = session ? getSessionIssuedAt(session.access_token) : null;
        const withinGracePeriod = issuedAt !== null && Date.now() / 1000 - issuedAt < REMEMBER_MARKER_GRACE_PERIOD_SECONDS;

        if (withinGracePeriod) {
          return response;
        }

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
    if (user && !isApiPath && !isPortalPath) {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

      // VEREXA-AAL-001: /settings/security is deliberately NOT exempt here
      // (see MFA_CHALLENGE_EXEMPT_PATHS's own comment) -- a verified factor
      // this session hasn't challenged yet must be challenged before
      // reaching the page that can remove that factor.
      if (aal && aal.currentLevel === "aal1" && aal.nextLevel === "aal2" && !MFA_CHALLENGE_EXEMPT_PATHS.some((path) => pathname.startsWith(path))) {
        const redirectUrl = new URL("/mfa-challenge", request.url);
        redirectUrl.searchParams.set("next", pathname);
        return NextResponse.redirect(redirectUrl);
      }

      if (aal && aal.currentLevel === "aal1" && aal.nextLevel === "aal1" && !MFA_ENROLLMENT_EXEMPT_PATHS.some((path) => pathname.startsWith(path))) {
        // VEREXA-AAL-001: previously only the first active membership row
        // (.limit(1), no explicit order) was checked, so whether enrollment
        // was forced for a multi-workspace user depended on which row the
        // query happened to return. Checking "does ANY active membership's
        // workspace require MFA" is the safe, conservative model: a user
        // can switch into any workspace they belong to at any time (see
        // /api/workspace/switch), so if even one requires MFA, this user
        // must not be allowed to go without a factor enrolled, independent
        // of which workspace is currently selected.
        const { data: memberships } = await supabase
          .from("workspace_users")
          .select("workspace_id")
          .eq("user_id", user.id)
          .eq("status", "active");

        const workspaceIds = (memberships ?? []).map((m) => m.workspace_id);
        if (workspaceIds.length > 0) {
          const { data: policies } = await supabase
            .from("workspace_security_policies")
            .select("workspace_id")
            .in("workspace_id", workspaceIds)
            .eq("mfa_required", true)
            .limit(1);

          if (policies && policies.length > 0) {
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
