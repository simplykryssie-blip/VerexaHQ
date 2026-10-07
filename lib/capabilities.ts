import type { SupabaseClient } from "@supabase/supabase-js";

// Known platform capability keys (feature_flags.key). Not exhaustive --
// existing flags like "crm", "billing", "client_portal" etc. are valid
// keys too -- this just gives editor autocomplete for the newer,
// explicitly tiered ones added for Firm Connections / partner management.
export type CapabilityKey =
  | "firm_connections"
  | "partner_management"
  | "third_party_product_distribution"
  | "provisioning"
  | (string & {});

/**
 * The single platform-level capability check: tier eligibility
 * (workspace_type vs feature_flags.min_workspace_tier, cumulative
 * PTIN -> ERO -> Service Bureau) AND entitlement (workspace_feature_flags
 * override, else feature_flags.default_enabled). See
 * workspace_has_capability() in the database -- this is a thin client
 * wrapper, same convention as loadActionPermissions()'s has_permission calls.
 */
export async function hasCapability(supabase: SupabaseClient, workspaceId: string, capabilityKey: CapabilityKey): Promise<boolean> {
  const { data } = await supabase.rpc("workspace_has_capability", { p_workspace_id: workspaceId, p_capability_key: capabilityKey });
  return Boolean(data);
}
