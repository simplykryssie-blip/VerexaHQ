import Link from "next/link";
import { ClipboardList, Handshake } from "lucide-react";
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
  const [{ count }, branding, { data: pendingOrganizers }, { data: pendingQuotes }] = await Promise.all([
    supabase
      .from("notification_queue")
      .select("id", { count: "exact", head: true })
      .in("channel", ["In-App", "Portal"])
      .neq("status", "cancelled"),
    getEffectiveBranding(identity.workspaceId),
    supabase
      .from("organizer_responses")
      .select("id, organizer_templates(name)")
      .eq("client_id", identity.clientId)
      .in("status", ["not_started", "in_progress"])
      .order("created_at", { ascending: true }),
    supabase
      .from("quotes")
      .select("id, title")
      .eq("client_id", identity.clientId)
      .eq("status", "sent")
      .order("created_at", { ascending: true }),
  ]);

  const brandVars: React.CSSProperties = {};
  if (branding.secondaryColor) {
    const accentRgb = hexToRgbTriplet(branding.secondaryColor);
    const accentSoftRgb = lightenHexToRgbTriplet(branding.secondaryColor, 0.85);
    if (accentRgb) (brandVars as Record<string, string>)["--brand-accent-rgb"] = accentRgb;
    if (accentSoftRgb) (brandVars as Record<string, string>)["--brand-accent-soft-rgb"] = accentSoftRgb;
  }

  const pending = pendingOrganizers ?? [];
  const firstPendingName = (pending[0]?.organizer_templates as unknown as { name?: string } | null)?.name;
  const quotesAwaitingResponse = pendingQuotes ?? [];

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
        <div className="flex h-screen overflow-hidden bg-surfaceMuted print:h-auto print:overflow-visible">
          <div className="print:hidden">
            <PortalSidebar
              clientLabel={identity.clientLabel}
              pendingCount={count ?? 0}
              logoUrl={branding.portalLogoUrl}
              firmName={branding.displayName}
            />
          </div>
          <main id="portal-main-content" className="flex flex-1 flex-col overflow-y-auto pt-14 lg:pt-0 print:overflow-visible print:pt-0">
            {quotesAwaitingResponse.length > 0 && (
              <Link
                href="/portal/quotes"
                className="sticky top-0 z-20 flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm font-medium text-ink hover:bg-warning/20 print:hidden"
              >
                <Handshake size={15} className="shrink-0 text-warning" aria-hidden="true" />
                {quotesAwaitingResponse.length === 1
                  ? `You have a quote to review: ${quotesAwaitingResponse[0].title} -- accept or decline it`
                  : `You have ${quotesAwaitingResponse.length} quotes to review -- accept or decline them`}
              </Link>
            )}
            {pending.length > 0 && (
              <Link
                href={pending.length === 1 ? `/portal/organizer/${pending[0].id}` : "/portal/organizer"}
                className="sticky top-0 z-20 flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-sm font-medium text-ink hover:bg-warning/20 print:hidden"
              >
                <ClipboardList size={15} className="shrink-0 text-warning" aria-hidden="true" />
                {pending.length === 1
                  ? `You have an organizer to complete: ${firstPendingName ?? "Organizer"} -- start it now`
                  : `You have ${pending.length} organizers to complete -- start them now`}
              </Link>
            )}
            {children}
          </main>
        </div>
      </ToastProvider>
    </div>
  );
}
