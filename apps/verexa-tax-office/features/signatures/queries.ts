import { createClient } from "@/lib/supabase/server";

export async function getSignatureRequests(workspaceId: string, opts?: { status?: string; clientId?: string; engagementId?: string }) {
  const supabase = await createClient();
  let query = supabase
    .from("signature_requests")
    .select("*, client:clients(id, first_name, last_name, company), signers:signature_signers(id, status)")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (opts?.status) query = query.eq("status", opts.status as never);
  if (opts?.clientId) query = query.eq("client_id", opts.clientId);
  if (opts?.engagementId) query = query.eq("engagement_id", opts.engagementId);
  const { data } = await query;
  return data ?? [];
}

export async function getSignatureRequestDetail(id: string) {
  const supabase = await createClient();
  const [{ data: request }, { data: signers }, { data: events }, { data: certificate }] = await Promise.all([
    supabase
      .from("signature_requests")
      .select("*, client:clients(id, first_name, last_name, company), engagement:tax_engagements(id, engagement_number, title), document:documents(id, display_name, bucket_id, storage_path)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("signature_signers").select("*").eq("signature_request_id", id).order("signing_order"),
    supabase.from("signature_events").select("*").eq("signature_request_id", id).order("event_at", { ascending: true }),
    supabase.from("signature_certificates").select("*").eq("signature_request_id", id).maybeSingle(),
  ]);
  return { request, signers: signers ?? [], events: events ?? [], certificate: certificate ?? null };
}
