import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/auth/portal";
import { getPortalUnreadNotificationCount, getPortalUnreadMessageCount } from "@/features/portal/queries";
import { PortalSidebar } from "@/components/portal-shell/portal-sidebar";
import { PortalHeader } from "@/components/portal-shell/portal-header";

export default async function PortalAppLayout({ children }: { children: React.ReactNode }) {
  const context = await getPortalContext();
  if (!context) redirect("/portal/sign-in");

  const [unreadNotifications, unreadMessages] = await Promise.all([
    getPortalUnreadNotificationCount(context.client.id),
    getPortalUnreadMessageCount(context.client.id),
  ]);

  const displayName = context.contactName ?? context.client.display_name ?? `${context.client.first_name} ${context.client.last_name}`.trim();

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      <PortalSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <PortalHeader
          displayName={displayName}
          email={context.client.email}
          unreadNotifications={unreadNotifications}
          unreadMessages={unreadMessages}
        />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
