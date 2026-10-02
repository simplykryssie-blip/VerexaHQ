import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { hasAal2 } from "@/lib/auth/requireAal2";

// VEREXA-AAL-001: MfaSetup.tsx used to call supabase.auth.mfa.unenroll()
// directly from the browser, with nothing but a client-side confirm()
// dialog in front of it -- a password-only (stolen-credential) session
// could strip the legitimate owner's second factor with no step-up at all.
// This moves the removal server-side, behind the same hasAal2() check used
// everywhere else in this remediation, before ever touching the factor.
//
// Requires the service-role Admin API (auth.admin.mfa.deleteFactor) because
// there is no RLS-governed table backing a user's own MFA factors for a
// plain RPC to guard instead -- they live in Supabase Auth's own schema.
// Both userId and id are required by that API and the delete is scoped to
// `/admin/users/{userId}/factors/{id}` server-side, so a caller can never
// delete a factor belonging to a different user by supplying someone
// else's factorId -- userId always comes from this request's own verified
// session, never from the request body.
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!(await hasAal2(supabase))) {
    return NextResponse.json(
      { error: "This action requires two-factor verification. Complete your authenticator challenge and try again." },
      { status: 403 }
    );
  }

  const { factorId } = (await request.json().catch(() => ({}))) as { factorId?: string };
  if (!factorId) {
    return NextResponse.json({ error: "factorId is required" }, { status: 400 });
  }

  const serviceClient = createServiceClient();
  const { error } = await serviceClient.auth.admin.mfa.deleteFactor({ userId: user.id, id: factorId });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
