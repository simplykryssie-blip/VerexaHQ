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
      const meta = user.user_metadata as { pending_invite_next?: string; pending_invite_token?: string } | undefined;
      if (meta?.pending_invite_next && meta?.pending_invite_token) {
        return `${meta.pending_invite_next}?token=${encodeURIComponent(meta.pending_invite_token)}`;
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
      return withRememberMarker(NextResponse.redirect(`${origin}${await resolveNext()}`));
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return withRememberMarker(NextResponse.redirect(`${origin}${await resolveNext()}`));
    }
  }

  return NextResponse.redirect(`${origin}/login?error=confirmation_failed`);
}
