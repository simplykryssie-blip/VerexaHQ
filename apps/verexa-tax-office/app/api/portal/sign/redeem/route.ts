import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/errors";

// Magic-link signing has no portal login — the single-use token is the
// only credential. redeem_signature_token is SECURITY DEFINER but its
// EXECUTE grant is service_role-only (not anon/authenticated), so this
// step can only run server-side with the service-role client. The route
// marks the token viewed/used and returns just enough display data to
// render the signing page; it never exposes the service-role key itself.
export async function POST(request: Request) {
  const { token } = await request.json();
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Missing signing token." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: redeemed, error: redeemError } = await admin.rpc("redeem_signature_token", { p_token: token });
  if (redeemError || !redeemed) {
    return NextResponse.json({ error: "This signing link is invalid, expired, or has already been used." }, { status: 400 });
  }

  const { signer_id: signerId, signature_request_id: signatureRequestId } = redeemed as { signer_id: string; signature_request_id: string; workspace_id: string };

  const [{ data: request_, error: requestError }, { data: signer }, { data: signers }] = await Promise.all([
    admin
      .from("signature_requests")
      .select("id, title, message, status, signing_order_required, expires_at, document:documents(id, display_name, bucket_id, storage_path)")
      .eq("id", signatureRequestId)
      .maybeSingle(),
    admin.from("signature_signers").select("id, name, email, role, signing_order, status, signed_at").eq("id", signerId).maybeSingle(),
    admin.from("signature_signers").select("id, name, signing_order, status").eq("signature_request_id", signatureRequestId).order("signing_order"),
  ]);

  if (requestError || !request_ || !signer) {
    logServerError("portal sign redeem lookup", requestError);
    return NextResponse.json({ error: "Couldn't load this signature request." }, { status: 500 });
  }

  let documentUrl: string | null = null;
  const doc = request_.document as { id: string; display_name: string; bucket_id: string; storage_path: string } | null;
  if (doc) {
    const { data: signed } = await admin.storage.from(doc.bucket_id).createSignedUrl(doc.storage_path, 300);
    documentUrl = signed?.signedUrl ?? null;
  }

  return NextResponse.json({
    request: { id: request_.id, title: request_.title, message: request_.message, status: request_.status, signingOrderRequired: request_.signing_order_required },
    signer,
    signers: signers ?? [],
    document: doc ? { displayName: doc.display_name, url: documentUrl } : null,
  });
}
