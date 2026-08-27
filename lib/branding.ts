import { createClient } from "@/lib/supabase/server";

export type EffectiveBranding = {
  brandingWorkspaceId: string;
  isWhitelabeledByEro: boolean;
  eroName: string | null;
  displayName: string | null;
  /** For the staff dashboard's sidebar. */
  sidebarLogoUrl: string | null;
  /** For the client-facing portal. */
  portalLogoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  /** Custom sidebar background color, if the workspace has set one -- Sidebar.tsx computes readable text against it automatically. Null keeps the default light rail. */
  sidebarBgColor: string | null;
};

/**
 * Resolves which workspace's `branding` row should be shown to a given
 * workspace -- staff dashboard and client portal alike. PTINs with an active
 * ero_ptin connection show their ERO's brand instead of their own; their
 * clients see the ERO's brand on the portal too -- neither gets its own
 * Brand Center once connected.
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
    .select("display_name, sidebar_logo_url, portal_logo_url, logo_url, primary_color, secondary_color, sidebar_bg_color")
    .eq("workspace_id", brandingWorkspaceId)
    .maybeSingle();

  // No brand logo uploaded at all -- fall back to the workspace owner's avatar
  // photo rather than showing nothing. Common for solo PTINs whose "brand" is
  // just themselves.
  let ownerAvatarUrl: string | null = null;
  if (!branding?.sidebar_logo_url && !branding?.portal_logo_url && !branding?.logo_url) {
    const { data: owner } = await supabase
      .from("workspace_users")
      .select("user_profiles(avatar_url)")
      .eq("workspace_id", brandingWorkspaceId)
      .eq("is_owner", true)
      .maybeSingle();
    ownerAvatarUrl = (owner?.user_profiles as unknown as { avatar_url: string | null } | null)?.avatar_url ?? null;
  }

  const sidebarLogoUrl = branding?.sidebar_logo_url ?? branding?.logo_url ?? ownerAvatarUrl;

  return {
    brandingWorkspaceId,
    isWhitelabeledByEro,
    eroName,
    displayName: branding?.display_name ?? null,
    sidebarLogoUrl,
    // Explicit portal logo, else the same brand logo shown on the staff sidebar
    // (including its own owner-avatar fallback), matching the Brand Logo
    // field's "leave blank to reuse" copy.
    portalLogoUrl: branding?.portal_logo_url ?? sidebarLogoUrl,
    primaryColor: branding?.primary_color ?? null,
    secondaryColor: branding?.secondary_color ?? null,
    sidebarBgColor: branding?.sidebar_bg_color ?? null,
  };
}
