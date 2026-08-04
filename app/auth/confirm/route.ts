import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";

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

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return withRememberMarker(NextResponse.redirect(`${origin}${next}`));
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return withRememberMarker(NextResponse.redirect(`${origin}${next}`));
    }
  }

  return NextResponse.redirect(`${origin}/login?error=confirmation_failed`);
}
