import type { SupabaseClient } from "@supabase/supabase-js";

// A signing link has no logged-in user to gate a storage RLS insert policy
// against, so a drawn signature always goes through a server route using
// the service-role client -- this just centralizes the decode + upload +
// path shape shared by every one of those routes.
export async function uploadSignatureImage(
  supabase: SupabaseClient,
  workspaceId: string,
  scopeId: string,
  dataUrl: string
): Promise<{ path: string } | { error: string }> {
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
  if (!match) {
    return { error: "Invalid signature image" };
  }
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length === 0 || bytes.length > 2 * 1024 * 1024) {
    return { error: "Signature image is empty or too large" };
  }
  const path = `${workspaceId}/${scopeId}/${Date.now()}-signature.png`;
  const { error } = await supabase.storage.from("signatures").upload(path, bytes, { contentType: "image/png" });
  if (error) return { error: error.message };
  return { path };
}

// Browser counterpart for SignaturesPanel's authenticated inline signing
// (portal users signing their own request) -- there IS a session there, so
// this uploads directly from the client against the signatures_portal_insert
// storage RLS policy instead of going through a server route. Same shape,
// just base64-decoded via atob() since Buffer isn't available in the browser.
export async function uploadSignatureImageClient(
  supabase: SupabaseClient,
  workspaceId: string,
  scopeId: string,
  dataUrl: string
): Promise<{ path: string } | { error: string }> {
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
  if (!match) {
    return { error: "Invalid signature image" };
  }
  const binary = atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  if (bytes.length === 0 || bytes.length > 2 * 1024 * 1024) {
    return { error: "Signature image is empty or too large" };
  }
  const path = `${workspaceId}/${scopeId}/${Date.now()}-signature.png`;
  const { error } = await supabase.storage.from("signatures").upload(path, bytes, { contentType: "image/png" });
  if (error) return { error: error.message };
  return { path };
}
