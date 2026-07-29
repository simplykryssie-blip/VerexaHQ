import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, createServiceClient } from "@/lib/serverAuth";
import { createEarlyAccessCheckoutSession } from "@/lib/stripeCheckout";

// Recovery path for "workspace created but Stripe checkout/subscription
// creation failed" or "user closed the browser mid-process": once signed
// in, an owner whose workspace came through an Early Access invitation but
// has no workspace_subscriptions row yet can resume billing setup instead
// of being stuck.
export async function POST(req: NextRequest) {
  let user, supabase;
  try {
    ({ user, supabase } = await authenticateRequest(req));
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const payload = (await req.json().catch(() => null)) as { workspaceId?: string } | null;
  const workspaceId = payload?.workspaceId?.trim();
  if (!workspaceId) return NextResponse.json({ ok: false, error: "Missing workspace." }, { status: 400 });

  const { data: workspace } = await supabase.from("workspaces").select("id, owner_id").eq("id", workspaceId).maybeSingle();
  if (!workspace || workspace.owner_id !== user.id) {
    return NextResponse.json({ ok: false, error: "You don't have access to that workspace." }, { status: 403 });
  }

  const { data: agreement } = await supabase
    .from("early_access_agreements")
    .select("invitation_id")
    .eq("workspace_id", workspaceId)
    .not("invitation_id", "is", null)
    .order("accepted_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!agreement?.invitation_id) {
    return NextResponse.json({ ok: false, error: "No Early Access invitation is associated with this workspace." }, { status: 404 });
  }

  let service;
  try {
    service = createServiceClient();
  } catch {
    return NextResponse.json({ ok: false, error: "Server billing credential not configured." }, { status: 503 });
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, "");
  const checkout = await createEarlyAccessCheckoutSession(service, {
    workspaceId,
    invitationId: agreement.invitation_id as string,
    successUrl: `${appUrl}/early-access/onboarding?checkout=success`,
    cancelUrl: `${appUrl}/settings?tab=subscription&checkout=canceled`,
    email: user.email ?? null,
  });

  if (!checkout.ok) {
    return NextResponse.json({ ok: false, error: checkout.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true, checkoutUrl: checkout.checkoutUrl });
}
