import { redirect } from "next/navigation";
import { getPortalIdentity } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { PortalSidebar } from "@/components/portal/PortalSidebar";
import { ToastProvider } from "@/components/Toast";
import { IdleLogout } from "@/components/IdleLogout";
import { getEffectiveBranding } from "@/lib/branding";
import { hexToRgbTriplet, lightenHexToRgbTriplet } from "@/lib/color";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const identity = await getPortalIdentity();
  if (!identity) redirect("/portal/login");

  const supabase = createClient();
  const [{ count }, branding] = await Promise.all([
    supabase
      .from("notification_queue")
      .select("id", { count: "exact", head: true })
      .in("channel", ["In-App", "Portal"])
      .neq("status", "cancelled"),
    getEffectiveBranding(identity.workspaceId),
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
        <IdleLogout timeoutMinutes={15} loginPath="/portal/login" />
        <a
          href="#portal-main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
        >
          Skip to main content
        </a>
        <div className="flex h-screen overflow-hidden bg-surfaceMuted">
          <PortalSidebar
            clientLabel={identity.clientLabel}
            pendingCount={count ?? 0}
            logoUrl={branding.portalLogoUrl}
            firmName={branding.displayName}
          />
          <main id="portal-main-content" className="flex flex-1 flex-col overflow-y-auto pt-14 lg:pt-0">
            {children}
          </main>
        </div>
      </ToastProvider>
    </div>
  );
}
