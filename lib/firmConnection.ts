import type { SupabaseClient } from "@supabase/supabase-js";

export type MyEroConnection = {
  connection_id: string;
  ero_workspace_id: string;
  name: string;
  relationship_type: string;
  phone: string | null;
  primary_contact_email: string | null;
  website: string | null;
  billing_responsibility: string;
  shares_communications_identity: boolean;
  allows_branding_override: boolean;
};

/**
 * The active ERO/service-bureau connection for a PTIN-tier workspace, or
 * null if it isn't connected to one. Only meaningful for a workspace where
 * isEroManagementTier() is false -- an ERO-tier workspace is the parent
 * side of connections, never the child, so this always returns null for
 * one and callers should skip the RPC round-trip entirely for that tier.
 */
export async function getMyEroConnection(supabase: SupabaseClient, workspaceId: string): Promise<MyEroConnection | null> {
  const { data } = await supabase.rpc("get_my_ero_connection", { p_workspace_id: workspaceId });
  return (data as MyEroConnection[] | null)?.[0] ?? null;
}
