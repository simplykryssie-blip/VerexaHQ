import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";

// Public, token-authorized file access for external signers with no
// account -- the same trust model as record_signature_by_token/
// decline_signature_by_token (see migration public_signature_link):
// the token itself is the authorization, verified with the service-role
// client since there's no session to run RLS against.
export async function GET(request: Request, { params }: { params: { token: string } }) {
  const allowed = await checkRateLimit(`sign-file:${clientIp(request)}`, 20, 60);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const supabase = createServiceClient();

  // signature_requests has two FKs into attachments (attachment_id and
  // final_pdf_attachment_id, added later by signature_request_final_pdf) --
  // PostgREST can't pick one for an unqualified `attachments(...)` embed and
  // errors out, which the old code silently swallowed (only `data` was
  // destructured, never `error`), so every real signer hit this route's
  // fallback 404 "invalid or expired" regardless of whether their link was
  // actually fine. Qualifying the FK by name fixes the embed; checking
  // `error` explicitly stops a future schema issue from being masked the
  // same way.
  const { data: signer, error: signerError } = await supabase
    .from("signature_request_signers")
    .select(
      "id, signature_request:signature_requests(attachment:attachments!signature_requests_attachment_id_fkey(storage_path, file_name, mime_type))"
    )
    .eq("access_token", params.token)
    .maybeSingle();

  if (signerError) {
    return NextResponse.json({ error: "Could not load document." }, { status: 500 });
  }

  const attachment = (signer as any)?.signature_request?.attachment;
  if (!attachment) {
    return NextResponse.json({ error: "Invalid or expired signing link." }, { status: 404 });
  }

  const { data, error } = await supabase.storage.from("client-documents").createSignedUrl(attachment.storage_path, 300);
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not load document." }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl, fileName: attachment.file_name, mimeType: attachment.mime_type });
}
