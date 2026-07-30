import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/auth/portal";
import { getPortalNotifications } from "@/features/portal/queries";
import { PortalNotificationList } from "@/features/portal/notification-list";

export default async function PortalNotificationsPage() {
  const context = await getPortalContext();
  if (!context) redirect("/portal/sign-in");

  const notifications = await getPortalNotifications(context.client.id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="text-sm text-muted-foreground mt-1">Updates from your tax office.</p>
      </div>
      <PortalNotificationList clientId={context.client.id} notifications={notifications} />
    </div>
  );
}
