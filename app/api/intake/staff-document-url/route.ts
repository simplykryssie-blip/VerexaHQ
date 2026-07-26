import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, createServiceClient } from "@/lib/serverAuth";

// Staff-only. intake_documents' storage paths aren't covered by the
// existing client-document storage RLS policies (those key off the
// `documents` table, not this new one), so this route re-checks workspace
// membership itself via the same authenticated (RLS-scoped) client used
// everywhere else, then uses the service-role storage client only to mint
// a short-lived signed URL -- never to hand out broader storage access.
export async function GET(req: NextRequest) {
  let auth;
  try {
    auth = await authenticateRequest(req);
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const documentId = req.nextUrl.searchParams.get("documentId");
  if (!documentId) {
    return NextResponse.json({ ok: false, error: "Missing documentId." }, { status: 400 });
  }

  // RLS on intake_documents already scopes this select to workspaces the
  // caller belongs to -- a document from another workspace simply won't
  // be found.
  const { data: doc, error } = await auth.supabase
    .from("intake_documents")
    .select("storage_bucket, storage_path")
    .eq("id", documentId)
    .maybeSingle();

  if (error || !doc) {
    return NextResponse.json({ ok: false, error: "Document not found." }, { status: 404 });
  }

  const service = createServiceClient();
  const { data: signed, error: signError } = await service.storage
    .from(doc.storage_bucket)
    .createSignedUrl(doc.storage_path, 300);
  if (signError || !signed) {
    return NextResponse.json({ ok: false, error: "Could not generate a link." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, url: signed.signedUrl });
}
