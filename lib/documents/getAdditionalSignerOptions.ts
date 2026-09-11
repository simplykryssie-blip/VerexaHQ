import type { SupabaseClient } from "@supabase/supabase-js";

export type AdditionalSignerOption = { name: string; email: string | null; label: string };

// Surfaces a client's linked contacts (spouse, business co-owner, etc. --
// client_relationships) as one-click "add as signer" options wherever a
// signature request is created, so requesting a second signature doesn't
// mean re-typing a name/email staff already have on file. A relationship
// only carries an email when it points at a real linked client record
// (related_client_id) -- a free-text relationship (no linked client) still
// shows up so staff can add it, just without a prefilled email.
export async function getAdditionalSignerOptions(supabase: SupabaseClient, clientId: string): Promise<AdditionalSignerOption[]> {
  const { data: relationships } = await supabase
    .from("client_relationships")
    .select("relationship_type, custom_relationship_title, related_name, related_client_id")
    .eq("client_id", clientId)
    .order("display_order");
  if (!relationships || relationships.length === 0) return [];

  const linkedIds = Array.from(new Set(relationships.map((r) => r.related_client_id).filter((id): id is string => Boolean(id))));
  const emailById = new Map<string, string | null>();
  if (linkedIds.length > 0) {
    const { data: linkedClients } = await supabase.from("clients").select("id, primary_email").in("id", linkedIds);
    for (const c of linkedClients ?? []) emailById.set(c.id, c.primary_email);
  }

  return relationships
    .filter((r) => r.related_name)
    .map((r) => ({
      name: r.related_name as string,
      email: r.related_client_id ? emailById.get(r.related_client_id) ?? null : null,
      label: r.relationship_type === "other" && r.custom_relationship_title ? r.custom_relationship_title : r.relationship_type,
    }));
}
