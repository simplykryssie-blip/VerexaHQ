import Link from "next/link";
import { HelpCircle } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { GlobalSearch } from "@/components/GlobalSearch";
import { NotificationBell } from "@/components/NotificationBell";
import { Avatar } from "@/components/Avatar";

/**
 * The persistent chrome the sidebar alone couldn't provide: where you are (breadcrumbs),
 * a fast way to jump to a client (search), and notifications anchored somewhere predictable
 * instead of floating over whatever the page happens to render underneath.
 */
export function AppHeader({
  workspaceId,
  userId,
  currentUser,
}: {
  workspaceId: string;
  userId: string | null;
  currentUser?: { name: string | null; avatarUrl: string | null; roleLabel: string | null } | null;
}) {
  return (
    <header className="flex items-center gap-4 border-b border-border bg-surface px-4 py-2.5 lg:px-8">
      <div className="min-w-0 flex-1">
        <Breadcrumbs />
      </div>
      <GlobalSearch workspaceId={workspaceId} />
      {userId && <NotificationBell workspaceId={workspaceId} userId={userId} />}
      <Link href="/support" aria-label="Help & support" className="text-muted transition hover:text-ink">
        <HelpCircle size={19} aria-hidden="true" />
      </Link>
      {currentUser && <Avatar name={currentUser.name} url={currentUser.avatarUrl} size="sm" />}
    </header>
  );
}
