import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// Account-holder email is the real Supabase Auth login email, not a
// separate contact field -- changing it needs the service-role admin API
// (auth.admin.updateUserById), not a SQL update against public.* tables.
// This is an outright admin correction (matches the trust level of
// provision-workspace's own admin.inviteUserByEmail call): no confirmation
// email round-trip, since the platform admin -- not the account holder --
// is the one making the change.
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: isPlatformAdmin } = await supabase.rpc("is_platform_admin");
  if (!isPlatformAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const userId = typeof body?.userId === "string" ? body.userId : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!userId || !email) {
    return NextResponse.json({ error: "userId and email are required" }, { status: 400 });
  }

  const serviceClient = createServiceClient();
  const { error } = await serviceClient.auth.admin.updateUserById(userId, { email, email_confirm: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
