import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type WorkspaceConnectResult = { ok: true; accountId: string } | { ok: false; reason: string };

/**
 * Direct charges require the workspace's own connected account. Returns a
 * plain-language reason when the workspace hasn't started or finished Stripe
 * Connect onboarding, so callers can surface it the same way as any other
 * "Stripe not configured" response.
 */
export async function getWorkspaceConnectAccount(
  supabase: SupabaseClient<Database>,
  workspaceId: string
): Promise<WorkspaceConnectResult> {
  const { data: workspace, error } = await supabase
    .from("workspaces")
    .select("stripe_connected_account_id, stripe_charges_enabled")
    .eq("id", workspaceId)
    .single();

  if (error || !workspace) {
    return { ok: false, reason: "Workspace not found." };
  }
  if (!workspace.stripe_connected_account_id) {
    return {
      ok: false,
      reason: "This workspace hasn't connected Stripe yet. Connect it in Settings > Integrations to accept payments.",
    };
  }
  if (!workspace.stripe_charges_enabled) {
    return {
      ok: false,
      reason: "This workspace's Stripe onboarding isn't finished yet. Finish it in Settings > Integrations to accept payments.",
    };
  }

  return { ok: true, accountId: workspace.stripe_connected_account_id };
}
