import { createClient } from "@/lib/supabase/server";

export type EffectiveBranding = {
  brandingWorkspaceId: string;
  isWhitelabeledByEro: boolean;
  eroName: string | null;
  displayName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
};

/**
 * Resolves which workspace's `branding` row should be shown in the staff app.
 * PTINs with an active ero_ptin connection show their ERO's brand instead of their own --
 * they don't get their own Brand Center.
 */
export async function getEffectiveBranding(workspaceId: string): Promise<EffectiveBranding> {
  const supabase = createClient();

  const { data: connection } = await supabase
    .from("firm_connections")
    .select("parent_workspace_id, workspaces:parent_workspace_id(name)")
    .eq("child_workspace_id", workspaceId)
    .eq("relationship_type", "ero_ptin")
    .eq("status", "active")
    .maybeSingle();

  const brandingWorkspaceId = connection?.parent_workspace_id ?? workspaceId;
  const isWhitelabeledByEro = Boolean(connection?.parent_workspace_id);
  const eroName = isWhitelabeledByEro
    ? (connection?.workspaces as unknown as { name: string } | null)?.name ?? null
    : null;

  const { data: branding } = await supabase
    .from("branding")
    .select("display_name, sidebar_logo_url, logo_url, primary_color, secondary_color")
    .eq("workspace_id", brandingWorkspaceId)
    .maybeSingle();

  return {
    brandingWorkspaceId,
    isWhitelabeledByEro,
    eroName,
    displayName: branding?.display_name ?? null,
    logoUrl: branding?.sidebar_logo_url ?? branding?.logo_url ?? null,
    primaryColor: branding?.primary_color ?? null,
    secondaryColor: branding?.secondary_color ?? null,
  };
}
