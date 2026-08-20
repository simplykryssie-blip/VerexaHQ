import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { ToastProvider } from "@/components/Toast";
import { GlobalClientDraftBanner } from "@/components/GlobalClientDraftBanner";
import { AppHeader } from "@/components/AppHeader";
import { IdleLogout } from "@/components/IdleLogout";
import { getCurrentWorkspace } from "@/lib/workspace";
import { getPortalIdentity } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveBranding } from "@/lib/branding";
import { hexToRgbTriplet, lightenHexToRgbTriplet } from "@/lib/color";

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

  const [{ data: securityPolicy }, branding, { data: isPlatformAdmin }] = await Promise.all([
    supabase
      .from("workspace_security_policies")
      .select("session_timeout_minutes")
      .eq("workspace_id", workspace.id)
      .maybeSingle(),
    getEffectiveBranding(workspace.id),
    supabase.rpc("is_platform_admin"),
  ]);

  const brandVars: React.CSSProperties = {};
  if (branding.secondaryColor) {
    const accentRgb = hexToRgbTriplet(branding.secondaryColor);
    const accentSoftRgb = lightenHexToRgbTriplet(branding.secondaryColor, 0.85);
    if (accentRgb) (brandVars as Record<string, string>)["--brand-accent-rgb"] = accentRgb;
    if (accentSoftRgb) (brandVars as Record<string, string>)["--brand-accent-soft-rgb"] = accentSoftRgb;
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
            isPlatformAdmin={Boolean(isPlatformAdmin)}
          />
          <main id="main-content" className="flex min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden pt-14 lg:pt-0">
            <AppHeader workspaceId={workspace.id} userId={user?.id ?? null} />
            <GlobalClientDraftBanner />
            {children}
          </main>
        </div>
      </ToastProvider>
    </div>
  );
}
