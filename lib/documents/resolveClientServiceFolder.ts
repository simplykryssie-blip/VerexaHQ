import type { createServiceClient } from "@/lib/supabase/service";

// Auto-generated client documents (a completed organizer, a signed
// engagement letter) previously always landed with folder_id null --
// nothing filed them anywhere, so every client's Documents was one flat
// pile. Resolves (creating if needed) a per-client, per-service top-level
// folder named after whichever service the client is actually interested
// in, same source-of-truth client_service_interests already uses for
// resolving organizer templates and lead pipelines. Returns null (leaving
// the caller to file with no folder, same as before) when no service can
// be resolved -- this must never fail the document filing itself.
export async function resolveClientServiceFolder(
  supabase: ReturnType<typeof createServiceClient>,
  workspaceId: string,
  clientId: string
): Promise<string | null> {
  const { data: interest } = await supabase
    .from("client_service_interests")
    .select("services(name)")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const serviceName = (interest?.services as unknown as { name?: string } | null)?.name;
  if (!serviceName) return null;

  const existing = await findFolder(supabase, workspaceId, clientId, serviceName);
  if (existing) return existing;

  const { error } = await supabase
    .from("document_folders")
    .insert({ workspace_id: workspaceId, entity_type: "client", entity_id: clientId, parent_folder_id: null, name: serviceName });
  if (error) {
    // Most likely lost a create race to a concurrent filing for the same
    // client -- the row should exist now either way.
    return findFolder(supabase, workspaceId, clientId, serviceName);
  }
  return findFolder(supabase, workspaceId, clientId, serviceName);
}

async function findFolder(supabase: ReturnType<typeof createServiceClient>, workspaceId: string, clientId: string, serviceName: string) {
  const { data } = await supabase
    .from("document_folders")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("entity_type", "client")
    .eq("entity_id", clientId)
    .is("parent_folder_id", null)
    .eq("name", serviceName)
    .maybeSingle();
  return data?.id ?? null;
}
