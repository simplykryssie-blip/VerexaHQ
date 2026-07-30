import Link from "next/link";
import { Bell, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PortalMobileNav } from "@/components/portal-shell/portal-mobile-nav";
import { PortalUserMenu } from "@/components/portal-shell/portal-user-menu";

export function PortalHeader({
  displayName,
  email,
  unreadNotifications = 0,
  unreadMessages = 0,
}: {
  displayName: string | null;
  email: string | null;
  unreadNotifications?: number;
  unreadMessages?: number;
}) {
  return (
    <header className="h-14 border-b border-border bg-background flex items-center gap-3 px-3 sm:px-4 shrink-0">
      <PortalMobileNav />
      <span className="font-semibold text-sm hidden sm:inline">Client Portal</span>
      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" asChild aria-label="Messages" className="relative">
          <Link href="/portal/messages">
            <MessagesSquare className="h-5 w-5" />
            {unreadMessages > 0 && (
              <Badge variant="destructive" className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 text-[9px] leading-4">
                {unreadMessages > 9 ? "9+" : unreadMessages}
              </Badge>
            )}
          </Link>
        </Button>
        <Button variant="ghost" size="icon" asChild aria-label="Notifications" className="relative">
          <Link href="/portal/notifications">
            <Bell className="h-5 w-5" />
            {unreadNotifications > 0 && (
              <Badge variant="destructive" className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 text-[9px] leading-4">
                {unreadNotifications > 9 ? "9+" : unreadNotifications}
              </Badge>
            )}
          </Link>
        </Button>
        <PortalUserMenu displayName={displayName} email={email} />
      </div>
    </header>
  );
}
