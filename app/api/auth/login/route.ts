import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkRateLimit } from "@/lib/rateLimit";
import { friendlyAuthError } from "@/lib/authErrors";

/**
 * The only path that may report a login result to record_login_result --
 * anon/authenticated no longer have EXECUTE on that RPC (see
 * 20261021000000_lock_down_login_result_rpc), because success/failure used
 * to be a caller-supplied boolean an unauthenticated caller could fabricate
 * for any email to lock that account out. Here it's decided from the real
 * signInWithPassword call this route just made -- never from client input --
 * so a caller can no longer manufacture a failed attempt against an account
 * it never actually tried to authenticate as.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const rateLimitAllowed = await checkRateLimit(`login:${email.toLowerCase()}`, 10, 300);
  if (!rateLimitAllowed) {
    return NextResponse.json({ error: "Too many sign-in attempts. Please wait a few minutes and try again." }, { status: 429 });
  }

  const serviceClient = createServiceClient();
  const { data: lockout } = await serviceClient.rpc("check_login_lockout", { p_email: email });
  if ((lockout as { locked?: boolean } | null)?.locked) {
    return NextResponse.json(
      { error: "This account is temporarily locked due to too many failed sign-in attempts. Try again later." },
      { status: 423 }
    );
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  await serviceClient.rpc("record_login_result", { p_email: email, p_success: !error });

  if (error) {
    return NextResponse.json({ error: friendlyAuthError(error.message) }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
