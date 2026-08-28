import { createClient } from "@/lib/supabase/server";
import { readableTextColor } from "@/lib/color";

export type EffectiveBranding = {
  brandingWorkspaceId: string;
  isWhitelabeledByEro: boolean;
  /** True only while isWhitelabeledByEro -- whether the ERO has let this PTIN set its own logo/accent on top. */
  allowsBrandingOverride: boolean;
  eroName: string | null;
  displayName: string | null;
  /** For the staff dashboard's sidebar. */
  sidebarLogoUrl: string | null;
  /** For the client-facing portal. */
  portalLogoUrl: string | null;
  /** Small, square, upload-time-generated derivative for the browser tab icon. */
  faviconUrl: string | null;
  /** For outgoing transactional emails -- falls back to the business logo, never the owner-avatar fallback (looks odd in an email header). */
  emailHeaderLogoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  /** Null means the sidebar keeps its default light background. */
  sidebarBgColor: string | null;
  /** Always set once sidebarBgColor is -- either the workspace's explicit choice, or auto-picked for contrast. */
  sidebarTextColor: string | null;
};

/**
 * Resolves which workspace's `branding` row should be shown to a given
 * workspace -- staff dashboard and client portal alike. PTINs with an active
 * ero_ptin connection show their ERO's brand instead of their own; their
 * clients see the ERO's brand on the portal too. If the ERO has switched on
 * `allows_branding_override` for that connection, the PTIN's own logo/color
 * win where they've set one (everything else -- business info, custom
 * domain, etc. -- still comes from the ERO).
 */
export async function getEffectiveBranding(workspaceId: string): Promise<EffectiveBranding> {
  const supabase = createClient();

  const { data: connection } = await supabase
    .from("firm_connections")
    .select("parent_workspace_id, allows_branding_override, workspaces:parent_workspace_id(name)")
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
    .select(
      "display_name, sidebar_logo_url, portal_logo_url, logo_url, favicon_url, email_header_logo_url, primary_color, secondary_color, sidebar_bg_color, sidebar_text_color"
    )
    .eq("workspace_id", brandingWorkspaceId)
    .maybeSingle();

  // If the ERO has allowed it, let the PTIN's own logo/color win over the
  // inherited ones -- everything else about the ERO's branding stays as-is.
  let ownBranding: {
    sidebar_logo_url: string | null;
    portal_logo_url: string | null;
    favicon_url: string | null;
    email_header_logo_url: string | null;
    primary_color: string | null;
    secondary_color: string | null;
    sidebar_bg_color: string | null;
    sidebar_text_color: string | null;
  } | null = null;
  if (isWhitelabeledByEro && connection?.allows_branding_override) {
    const { data } = await supabase
      .from("branding")
      .select("sidebar_logo_url, portal_logo_url, favicon_url, email_header_logo_url, primary_color, secondary_color, sidebar_bg_color, sidebar_text_color")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    ownBranding = data;
  }

  // No brand logo uploaded at all -- fall back to the workspace owner's avatar
  // photo rather than showing nothing. Common for solo PTINs whose "brand" is
  // just themselves.
  let ownerAvatarUrl: string | null = null;
  if (!ownBranding?.sidebar_logo_url && !branding?.sidebar_logo_url && !branding?.portal_logo_url && !branding?.logo_url) {
    const { data: owner } = await supabase
      .from("workspace_users")
      .select("user_profiles(avatar_url)")
      .eq("workspace_id", brandingWorkspaceId)
      .eq("is_owner", true)
      .maybeSingle();
    ownerAvatarUrl = (owner?.user_profiles as unknown as { avatar_url: string | null } | null)?.avatar_url ?? null;
  }

  const sidebarLogoUrl = ownBranding?.sidebar_logo_url ?? branding?.sidebar_logo_url ?? branding?.logo_url ?? ownerAvatarUrl;
  const sidebarBgColor = ownBranding?.sidebar_bg_color ?? branding?.sidebar_bg_color ?? null;
  const sidebarTextColorOverride = ownBranding?.sidebar_text_color ?? branding?.sidebar_text_color ?? null;
  const sidebarTextColor = sidebarBgColor ? sidebarTextColorOverride ?? readableTextColor(sidebarBgColor) : null;

  return {
    brandingWorkspaceId,
    isWhitelabeledByEro,
    allowsBrandingOverride: Boolean(isWhitelabeledByEro && connection?.allows_branding_override),
    eroName,
    displayName: branding?.display_name ?? null,
    sidebarLogoUrl,
    // Explicit portal logo, else the same brand logo shown on the staff sidebar
    // (including its own owner-avatar fallback), matching the Brand Logo
    // field's "leave blank to reuse" copy.
    portalLogoUrl: ownBranding?.portal_logo_url ?? branding?.portal_logo_url ?? sidebarLogoUrl,
    faviconUrl: ownBranding?.favicon_url ?? branding?.favicon_url ?? null,
    // Falls back to the plain business logo, not the sidebar's owner-avatar
    // fallback -- a personal headshot at the top of a transactional email
    // reads as a mistake, not a brand.
    emailHeaderLogoUrl: ownBranding?.email_header_logo_url ?? branding?.email_header_logo_url ?? branding?.logo_url ?? null,
    primaryColor: ownBranding?.primary_color ?? branding?.primary_color ?? null,
    secondaryColor: ownBranding?.secondary_color ?? branding?.secondary_color ?? null,
    sidebarBgColor,
    sidebarTextColor,
  };
}
