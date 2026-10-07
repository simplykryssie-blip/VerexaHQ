import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { uploadSignatureImage } from "@/lib/documents/uploadSignatureImage";

// Uploads a drawn signature for the connection-scoped public partner
// onboarding link (/partner-apply/[token]) before
// sign_public_partner_onboarding_agreement -- there's no logged-in user
// here, so this runs server-side with the service role after validating
// the token the same way that RPC does. Mirrors
// app/api/e/[token]/signature-image/route.ts exactly.
export async function POST(request: Request, { params }: { params: { token: string } }) {
  const allowed = await checkRateLimit(`partner-apply-signature-image:${clientIp(request)}`, 20, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const { dataUrl } = await request.json().catch(() => ({ dataUrl: null }));
  if (typeof dataUrl !== "string") {
    return NextResponse.json({ error: "dataUrl is required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: onboarding } = await supabase
    .from("partner_onboardings")
    .select("id, workspace_id")
    .eq("public_token", params.token)
    .maybeSingle();

  if (!onboarding) {
    return NextResponse.json({ error: "This link is no longer available" }, { status: 404 });
  }

  const result = await uploadSignatureImage(supabase, onboarding.workspace_id, onboarding.id, dataUrl);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ path: result.path });
}
