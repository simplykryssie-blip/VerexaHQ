import { redirect } from "next/navigation";
import { getPortalIdentity } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { PortalSidebar } from "@/components/portal/PortalSidebar";
import { ToastProvider } from "@/components/Toast";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const identity = await getPortalIdentity();
  if (!identity) redirect("/portal/login");

  const supabase = createClient();
  const { count } = await supabase
    .from("notification_queue")
    .select("id", { count: "exact", head: true })
    .in("channel", ["In-App", "Portal"])
    .neq("status", "cancelled");

  return (
    <ToastProvider>
      <a
        href="#portal-main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to main content
      </a>
      <div className="flex h-screen overflow-hidden bg-surfaceMuted">
        <PortalSidebar clientLabel={identity.clientLabel} pendingCount={count ?? 0} />
        <main id="portal-main-content" className="flex flex-1 flex-col overflow-y-auto pt-14 lg:pt-0">
          {children}
        </main>
      </div>
    </ToastProvider>
  );
}
