import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";
import { uploadSignatureImage } from "@/lib/documents/uploadSignatureImage";

// Uploads a drawn signature for the public organizer intake flow (/o/[token])
// before the actual answer is saved -- there's no logged-in user on this page
// (the client may not even have a portal account yet) to gate a storage RLS
// insert policy against, so this runs server-side with the service role,
// same pattern as /api/e/[token]/signature-image.
export async function POST(request: Request, { params }: { params: { token: string } }) {
  const allowed = await checkRateLimit(`o-signature-image:${clientIp(request)}`, 20, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const { dataUrl } = await request.json().catch(() => ({ dataUrl: null }));
  if (typeof dataUrl !== "string") {
    return NextResponse.json({ error: "dataUrl is required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: template } = await supabase
    .from("organizer_templates")
    .select("id, workspace_id")
    .eq("public_token", params.token)
    .eq("is_public", true)
    .eq("status", "published")
    .maybeSingle();

  if (!template || !template.workspace_id) {
    return NextResponse.json({ error: "This link is no longer available" }, { status: 404 });
  }

  const result = await uploadSignatureImage(supabase, template.workspace_id, template.id, dataUrl);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ path: result.path });
}
