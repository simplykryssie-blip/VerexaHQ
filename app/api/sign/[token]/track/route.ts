import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";

// Fire-and-forget call from PublicSignView.tsx on page load -- same trust
// model as the other token-authorized routes (file/signature-image): the
// token itself is the authorization, no session to run RLS against. IP is
// captured server-side (never trusted from the client); user agent is
// accepted from the body since navigator.userAgent is the only place that
// value can come from. Safe to call more than once -- viewed_at only sets
// on first call (see track_signature_view_by_token), and the user-agent
// update is an unconditional overwrite either way.
export async function POST(request: Request, { params }: { params: { token: string } }) {
  const allowed = await checkRateLimit(`sign-track:${clientIp(request)}`, 20, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const userAgent: string | undefined = body?.userAgent;

  const supabase = createServiceClient();

  await supabase.rpc("track_signature_view_by_token", {
    p_token: params.token,
    p_ip_address: clientIp(request),
  });

  if (userAgent) {
    await supabase.rpc("set_signature_user_agent_by_token", {
      p_token: params.token,
      p_user_agent: userAgent,
    });
  }

  return NextResponse.json({ ok: true });
}
