import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const explicitNext = searchParams.get("next");

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
  async function resolveNext() {
    if (explicitNext) return explicitNext;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
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
