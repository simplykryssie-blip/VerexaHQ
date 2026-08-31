import { NextResponse } from "next/server";
import { getPortalIdentity } from "@/lib/portal";
import { createServiceClient } from "@/lib/supabase/service";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { uploadSignatureImage } from "@/lib/documents/uploadSignatureImage";

// Uploads a drawn signature for the authenticated portal organizer flow
// (/portal/organizer/[id]). The generic signatures_portal_insert storage RLS
// policy only covers signature_requests (it checks is_pending_signer_for_
// signature_request), so it can't authorize this -- verifying the response
// belongs to the caller's own client here and uploading server-side instead.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const allowed = await checkRateLimit(`portal-organizer-signature:${clientIp(request)}`, 20, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const identity = await getPortalIdentity();
  if (!identity) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { dataUrl } = await request.json().catch(() => ({ dataUrl: null }));
  if (typeof dataUrl !== "string") {
    return NextResponse.json({ error: "dataUrl is required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: response } = await supabase
    .from("organizer_responses")
    .select("id, workspace_id, client_id")
    .eq("id", params.id)
    .eq("client_id", identity.clientId)
    .maybeSingle();

  if (!response) {
    return NextResponse.json({ error: "Organizer not found" }, { status: 404 });
  }

  const result = await uploadSignatureImage(supabase, response.workspace_id, response.id, dataUrl);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ path: result.path });
}
