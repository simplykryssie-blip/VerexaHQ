import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const explicitNext = searchParams.get("next");
  const inviteToken = searchParams.get("invite_token");

  const supabase = createClient();

  // Email-link flows (verification, password reset, invitations) don't offer a
  // "remember me" choice, so default to persistent -- matches the password
  // login form's default and avoids the "remember me" middleware check
  // signing the user straight back out for lacking the marker cookie.
  function withRememberMarker(response: NextResponse) {
    response.cookies.set("sb_remember", "persistent", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 400,
    });
    return response;
  }

  // Public-organizer signup asks for "next=/portal/dashboard" explicitly, but
  // Supabase's own redirect-URL allowlist can strip query params off
  // emailRedirectTo before this route ever sees them, silently falling back
  // to "/dashboard" -- the staff app. Since a client_portal_users identity
  // is never also a workspace_users one, landing on the empty staff
  // dashboard sends a brand-new client straight to "Set up your firm"
  // instead of their portal. If no explicit next survived, check which
  // kind of identity was just confirmed and route accordingly.
  //
  // Confirmed live via the raw confirmation email (Resend): our own
  // emailRedirectTo is built and sent correctly, with next and invite_token
  // as flat sibling params -- so the stripping happens inside Supabase's own
  // /auth/v1/verify redirect, a step this app doesn't control. That's the
  // same class of bug as the portal-signup case above, just unrecoverable by
  // guessing (there's no way to reverse-engineer *which* invite from
  // identity alone). So pending-invite flows (app/join/page.tsx,
  // app/accept-invitation/page.tsx, app/portal/accept-invitation/page.tsx)
  // additionally stash their token + destination in user_metadata at signUp
  // time -- that's written straight to the auth.users row, not threaded
  // through any redirect URL, so it survives even when the query string
  // doesn't. It's consulted only as a fallback, after the URL-based params.
  // Public-organizer self-serve signup (PublicOrganizerForm.tsx) stashes the
  // organizer's own public token (never a client id or workspace id -- see
  // the fix_public_organizer_portal_authorization migration) in
  // user_metadata at signUp() time, the same way pending_invite_token does
  // for staff invites above. The actual client_portal_users row is created
  // here, once, right after this route establishes a REAL session for the
  // now-confirmed user -- never earlier, when auth.uid() would still be
  // null and there'd be nothing to bind the row to but a caller-supplied
  // value. Runs unconditionally (before computing where to redirect) so it
  // still happens even if Supabase's own redirect-URL allow-list stripped
  // the emailRedirectTo's "next" query param before this route ever saw it.
  // Failure here (link expired, workspace no longer operational) shouldn't
  // break the sign-in itself -- the user still lands on /portal/dashboard,
  // just without portal access yet, same as any other activation edge case.
  // pending_portal_token is transport only, exactly like pending_invite_token
  // above -- it is never treated as proof of anything by
  // activate_public_portal_signup, which independently requires a matching
  // public organizer submission before it will activate.
  async function activatePendingOrganizerSignup() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const meta = user?.user_metadata as { pending_portal_token?: string } | undefined;
    if (!meta?.pending_portal_token) return;
    try {
      await supabase.rpc("activate_public_portal_signup", { p_token: meta.pending_portal_token });
    } catch {
      // Non-fatal -- see comment above.
    }
  }

  // Same pattern as activatePendingOrganizerSignup above, for the separate
  // public engagement-letter-with-signup flow (PublicEngagementLetterSign.tsx).
  // Kept as its own function and its own metadata key (pending_engagement_
  // letter_token, never pending_portal_token) rather than folding into the
  // organizer path above -- the two resolve a different template table
  // (engagement_letter_templates vs organizer_templates) and call a
  // different, independently-scoped activation RPC
  // (activate_public_engagement_letter_signup), which requires a matching
  // signed engagement-letter record, not an organizer submission.
  async function activatePendingEngagementLetterSignup() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const meta = user?.user_metadata as { pending_engagement_letter_token?: string } | undefined;
    if (!meta?.pending_engagement_letter_token) return;
    try {
      await supabase.rpc("activate_public_engagement_letter_signup", { p_token: meta.pending_engagement_letter_token });
    } catch {
      // Non-fatal -- see comment above.
    }
  }

  async function resolveNext() {
    if (explicitNext) {
      // invite_token rides as its own flat param (see app/join/page.tsx,
      // app/accept-invitation/page.tsx, app/portal/accept-invitation/page.tsx)
      // rather than nested inside next's own value, then gets reattached to
      // the destination path here as the "?token=..." those pages expect.
      return inviteToken ? `${explicitNext}?token=${encodeURIComponent(inviteToken)}` : explicitNext;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const meta = user.user_metadata as {
        pending_invite_next?: string;
        pending_invite_token?: string;
        pending_signup_next?: string;
      } | undefined;
      if (meta?.pending_invite_next && meta?.pending_invite_token) {
        return `${meta.pending_invite_next}?token=${encodeURIComponent(meta.pending_invite_token)}`;
      }
      if (meta?.pending_signup_next) {
        return meta.pending_signup_next;
      }
      const { data: portalUser } = await supabase
        .from("client_portal_users")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (portalUser) return "/portal/dashboard";
    }
    return "/dashboard";
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await activatePendingOrganizerSignup();
      await activatePendingEngagementLetterSignup();
      return withRememberMarker(NextResponse.redirect(`${origin}${await resolveNext()}`));
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      await activatePendingOrganizerSignup();
      await activatePendingEngagementLetterSignup();
      return withRememberMarker(NextResponse.redirect(`${origin}${await resolveNext()}`));
    }
  }

  return NextResponse.redirect(`${origin}/login?error=confirmation_failed`);
}
