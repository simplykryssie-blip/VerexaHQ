import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { ToastProvider } from "@/components/Toast";
import { GlobalClientDraftBanner } from "@/components/GlobalClientDraftBanner";
import { BillingCardPrompt } from "@/components/BillingCardPrompt";
import { AppHeader } from "@/components/AppHeader";
import { IdleLogout } from "@/components/IdleLogout";
import { getCurrentWorkspace } from "@/lib/workspace";
import { getPortalIdentity } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveBranding } from "@/lib/branding";
import { isEroManagementTier } from "@/lib/workspaceCapabilities";
import { hexToRgbTriplet, lightenHexToRgbTriplet } from "@/lib/color";
import { AcceptTermsGate } from "@/components/legal/AcceptTermsGate";
import { LEGAL_VERSION } from "@/lib/legal";

// Per-workspace favicon: the auto-generated square derivative of a
// workspace's uploaded business logo, falling back to Verexa's own mark so
// every workspace still gets a real tab icon before uploading one.
export async function generateMetadata(): Promise<Metadata> {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return {};
  const branding = await getEffectiveBranding(workspace.id);
  return { icons: { icon: branding.faviconUrl ?? "/brand/vmark.png" } };
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const workspace = await getCurrentWorkspace();

  if (!workspace) {
    // A client_portal_users identity is never also a workspace_users one --
    // if a client ends up here (e.g. an email confirmation link that lost
    // its "next" param), send them to their own portal instead of letting
    // them land on "Set up your firm", which would let a client spin up a
    // staff workspace for themselves.
    const portalIdentity = await getPortalIdentity();
    redirect(portalIdentity ? "/portal/dashboard" : "/onboarding");
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: securityPolicy },
    branding,
    { data: isPlatformAdmin },
    { data: isPlatformIt },
    { data: canUseNetworkMessaging },
    { count: teammateCount },
    { count: connectedPartnerCount },
    { data: hasAcceptedTerms },
    { data: billingCardRows },
    { data: currentProfile },
    { data: currentMembership },
    { data: roles },
  ] = await Promise.all([
    supabase
      .from("workspace_security_policies")
      .select("session_timeout_minutes")
      .eq("workspace_id", workspace.id)
      .maybeSingle(),
    getEffectiveBranding(workspace.id),
    supabase.rpc("is_platform_admin"),
    supabase.rpc("is_platform_it"),
    supabase.rpc("can_use_network_messaging", { p_workspace_id: workspace.id }),
    supabase
      .from("workspace_users")
      .select("user_id", { count: "exact", head: true })
      .eq("workspace_id", workspace.id)
      .eq("status", "active"),
    // Partners is only worth a nav slot once this workspace is actually an
    // ERO/SB with at least one PTIN connected (or invited) to it.
    supabase
      .from("firm_connections")
      .select("id", { count: "exact", head: true })
      .eq("parent_workspace_id", workspace.id)
      .eq("relationship_type", "ero_ptin"),
    // Only a workspace owner needs to accept -- staff are covered under
    // the Firm's own acceptance, same as the Terms' own language.
    workspace.is_owner
      ? supabase.rpc("has_accepted_platform_terms", { p_version: LEGAL_VERSION })
      : Promise.resolve({ data: true }),
    // Only the owner is prompted -- matches who can actually act on it
    // (FirmProfileForm gates the Stripe/billing fields on isOwner too).
    workspace.is_owner ? supabase.rpc("needs_billing_card", { p_workspace_id: workspace.id }) : Promise.resolve({ data: null }),
    // For the sidebar footer / header avatar -- no FK PostgREST can embed
    // between workspace_users and user_profiles (both independently
    // reference auth.users), same reason getWorkspaceStaff joins manually.
    user ? supabase.from("user_profiles").select("display_name, avatar_url").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    user
      ? supabase.from("workspace_users").select("role_id").eq("workspace_id", workspace.id).eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("roles").select("id, name").or(`workspace_id.is.null,workspace_id.eq.${workspace.id}`),
  ]);

  // Blocks the whole shell -- rendered instead of every other page, not a
  // dismissible overlay on top of one, so there is no route that skips it.
  if (workspace.is_owner && !hasAcceptedTerms) {
    return <AcceptTermsGate version={LEGAL_VERSION} />;
  }

  // Messages is relevant either for cross-firm network messaging (ERO/SB or
  // a connected PTIN) or plain staff-to-staff DMs within this workspace --
  // the latter just needs another active teammate to message.
  const hasTeammates = (teammateCount ?? 0) > 1;
  const billingCard = (billingCardRows ?? [])[0] ?? null;

  // Only fetched for a platform admin -- the sidebar's demo-workspace
  // switcher (home + the PTIN/ERO/SB shells) is a demo tool for that
  // account, not something regular staff need an extra query for on every
  // page load. is_platform_home sorts first, then PTIN/ERO/SB in that order.
  const DEMO_SORT_ORDER: Record<string, number> = { independent_ptin: 1, ero_office: 2, service_bureau: 3 };
  let switchableWorkspaces: { id: string; name: string; workspaceType: string; isHome: boolean; isActive: boolean }[] = [];
  if (isPlatformAdmin) {
    const { data: switchRows } = await supabase
      .from("workspaces")
      .select("id, name, workspace_type, is_platform_home")
      .or("is_platform_home.eq.true,is_demo.eq.true");
    switchableWorkspaces = (switchRows ?? [])
      .map((w) => ({ id: w.id, name: w.name, workspaceType: w.workspace_type, isHome: w.is_platform_home, isActive: w.id === workspace.id }))
      .sort((a, b) => (a.isHome === b.isHome ? 0 : a.isHome ? -1 : 1) || (DEMO_SORT_ORDER[a.workspaceType] ?? 99) - (DEMO_SORT_ORDER[b.workspaceType] ?? 99));
  }

  const roleName = currentMembership?.role_id ? (roles ?? []).find((r) => r.id === currentMembership.role_id)?.name ?? null : null;
  const currentUser = user
    ? {
        name: currentProfile?.display_name ?? null,
        avatarUrl: currentProfile?.avatar_url ?? null,
        roleLabel: workspace.is_owner ? "Owner" : roleName,
      }
    : null;

  const brandVars: React.CSSProperties = {};
  if (branding.secondaryColor) {
    const accentRgb = hexToRgbTriplet(branding.secondaryColor);
    const accentSoftRgb = lightenHexToRgbTriplet(branding.secondaryColor, 0.85);
    if (accentRgb) (brandVars as Record<string, string>)["--brand-accent-rgb"] = accentRgb;
    if (accentSoftRgb) (brandVars as Record<string, string>)["--brand-accent-soft-rgb"] = accentSoftRgb;
  }
  // Second stop of the Dashboard hero's gradient (see brandGradientTo in
  // tailwind.config.ts) -- a lightened tint of the SAME accent color, not an
  // independently-chosen second color. Two unrelated brand colors (e.g. an
  // indigo accent paired with an amber fallback color) can blend into a
  // muddy middle when used as gradient stops; tinting one color toward white
  // guarantees the gradient always stays in the same hue family and reads
  // clean, for any workspace's accent choice.
  if (branding.secondaryColor) {
    const gradientToRgb = lightenHexToRgbTriplet(branding.secondaryColor, 0.45);
    if (gradientToRgb) (brandVars as Record<string, string>)["--brand-gradient-to-rgb"] = gradientToRgb;
  }

  return (
    <div style={brandVars}>
      <ToastProvider>
        <IdleLogout timeoutMinutes={securityPolicy?.session_timeout_minutes ?? 15} loginPath="/login" />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
        >
          Skip to main content
        </a>
        <div className="flex h-screen overflow-hidden bg-surfaceMuted">
          <Sidebar
            workspaceName={branding.displayName ?? workspace.name}
            logoUrl={branding.sidebarLogoUrl}
            primaryColor={branding.primaryColor}
            secondaryColor={branding.secondaryColor}
            bgColor={branding.sidebarBgColor}
            textColor={branding.sidebarTextColor}
            isPlatformHomeWorkspace={workspace.is_platform_home}
            switchableWorkspaces={switchableWorkspaces}
            showMessages={Boolean(canUseNetworkMessaging) || hasTeammates}
            showPartners={(connectedPartnerCount ?? 0) > 0}
            showEroManagement={isEroManagementTier(workspace)}
            currentUser={currentUser}
          />
          <main id="main-content" className="flex min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden pt-14 lg:pt-0">
            <AppHeader workspaceId={workspace.id} userId={user?.id ?? null} currentUser={currentUser} />
            <GlobalClientDraftBanner />
            <BillingCardPrompt
              needed={Boolean(billingCard?.needed)}
              urgent={Boolean(billingCard?.urgent)}
              daysUntilPeriodEnd={billingCard?.days_until_period_end ?? null}
              periodEnd={billingCard?.period_end ?? null}
            />
            {children}
          </main>
        </div>
      </ToastProvider>
    </div>
  );
}
