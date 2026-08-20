import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { uploadSignatureImage } from "@/lib/documents/uploadSignatureImage";

// Uploads a drawn signature for the generic document-signing link
// (/sign/[token], components/sign/PublicSignView.tsx) before the actual
// record_signature_by_token RPC call -- same reasoning as
// /api/e/[token]/signature-image: no logged-in user to gate storage RLS
// against, so this validates the token and uploads server-side instead.
export async function POST(request: Request, { params }: { params: { token: string } }) {
  const allowed = await checkRateLimit(`sign-signature-image:${clientIp(request)}`, 20, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const { dataUrl } = await request.json().catch(() => ({ dataUrl: null }));
  if (typeof dataUrl !== "string") {
    return NextResponse.json({ error: "dataUrl is required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: signer } = await supabase
    .from("signature_request_signers")
    .select("id, status, signature_requests(id, workspace_id)")
    .eq("access_token", params.token)
    .maybeSingle();

  const request_ = signer?.signature_requests as unknown as { id: string; workspace_id: string } | null;
  if (!signer || signer.status !== "pending" || !request_) {
    return NextResponse.json({ error: "Invalid or already-used signing link" }, { status: 404 });
  }

  const result = await uploadSignatureImage(supabase, request_.workspace_id, request_.id, dataUrl);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ path: result.path });
}
